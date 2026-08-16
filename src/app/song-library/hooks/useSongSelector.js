"use client";

import { useActionState, useCallback, useEffect, useRef, startTransition } from "react";
import { SONG_CATALOG, DEFAULT_SONG_ID } from "../model/songRegistry";
import { transposeSeqToKey } from "../model/transposeSeq";

// L'action eseguita per ogni cambio di brano O di tonalità target (le due
// cose condividono la stessa action perché la trasposizione va applicata
// "all'atto del caricamento" - vedi transposeSeq.js - quindi cambiare
// tonalità è, a tutti gli effetti, un nuovo caricamento dello stesso
// brano). `previousState` è ignorato di proposito - ogni caricamento
// riparte da zero, non è incrementale.
async function loadSongAction(previousState, { songId, targetKeyTonic }) {
  const entry = SONG_CATALOG.find((s) => s.id === songId);
  if (!entry) return previousState;

  try {
    const seq = await entry.load();
    // Se il brano non ha una tonalità dichiarata (seq.meta.key mancante),
    // transposeSeqToKey restituisce seq invariato invece di indovinare -
    // vedi il commento lì per il motivo.
    const transposed = transposeSeqToKey(seq, targetKeyTonic);
    return { songId, targetKeyTonic, seq: transposed, error: null };
  } catch (err) {
    return { songId, targetKeyTonic, seq: null, error: err };
  }
}

const INITIAL_RESULT = {
  songId: null,
  targetKeyTonic: null,
  seq: null,
  error: null,
};

// La lista dei brani (solo metadati, niente seq) è disponibile subito.
// La `seq` del brano selezionato viene caricata on-demand con dynamic import.
export function useSongSelector() {
  // useActionState sostituisce sia lo stato di caricamento manuale sia il
  // guard anti-stale di una precedente versione (basata su un ref
  // incrementale): se l'utente cambia brano o tonalità mentre il
  // caricamento precedente è ancora in corso, è React stesso a scartare
  // il risultato dell'azione più vecchia quando arriva - vedi
  // https://jsdev.space/mastering-useactionstate/. `isPending` sostituisce
  // un confronto manuale "risultato risolto per cosa?".
  const [result, dispatchLoad, isPending] = useActionState(
    loadSongAction,
    INITIAL_RESULT,
  );

  // Le action di useActionState devono essere chiamate dentro una
  // transition se non passano per l'action/formAction di un <form> - qui
  // il selettore è un <select onChange> semplice (vedi
  // SongSelectorPanel.js/Select in playbackScreenUi.js), non un form,
  // quindi React non può avvolgerle automaticamente. Senza
  // startTransition, React emette un warning esplicito ("called outside
  // of a transition") e isPending smette di aggiornarsi correttamente.
  //
  // Entrambi i setter ricalcolano il payload combinando l'intent corrente
  // (ultimo songId/targetKeyTonic noti) con la modifica appena richiesta,
  // così cambiare SOLO la tonalità non perde il brano selezionato e
  // viceversa - il payload dell'action è sempre la coppia completa.
  const selectSong = useCallback(
    (songId) => {
      startTransition(() => {
        dispatchLoad({ songId, targetKeyTonic: result.targetKeyTonic });
      });
    },
    [dispatchLoad, result.targetKeyTonic],
  );

  const selectTargetKey = useCallback(
    (targetKeyTonic) => {
      startTransition(() => {
        dispatchLoad({
          songId: result.songId ?? DEFAULT_SONG_ID,
          targetKeyTonic: targetKeyTonic || null,
        });
      });
    },
    [dispatchLoad, result.songId],
  );

  // Le action non si auto-innescano al mount - serve comunque un effect
  // per il caricamento iniziale. A differenza di prima, però, è l'unico
  // effect rimasto: i cambi successivi passano tutti per selectSong/
  // selectTargetKey chiamati direttamente da SongSelectorPanel's onChange,
  // nessun effect osserva più lo stato per reagire ai cambi.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    startTransition(() => {
      dispatchLoad({ songId: DEFAULT_SONG_ID, targetKeyTonic: null });
    });
  }, [dispatchLoad]);

  // `songs` contiene i metadati leggeri (id + label + key) adatti per il
  // selettore UI - `key` viene da SONG_CATALOG direttamente (vedi
  // songRegistry.js), non dal seq caricato, così è disponibile anche per
  // brani non ancora caricati.
  const songs = SONG_CATALOG.map(({ id, label, key }) => ({ id, label, key }));

  return {
    songs,
    selectedId: result.songId ?? DEFAULT_SONG_ID,
    // Stessa firma di setSelectedId(id) di prima (chiamata diretta con
    // l'id, nessun payload aggiuntivo) - resta compatibile con
    // SongSelectorPanel's onChange senza che quel file debba cambiare.
    setSelectedId: selectSong,
    targetKeyTonic: result.targetKeyTonic ?? null,
    setTargetKeyTonic: selectTargetKey,
    seq: isPending ? null : result.seq,
    seqLoading: isPending,
    seqError: isPending ? null : result.error,
  };
}

export default useSongSelector;
