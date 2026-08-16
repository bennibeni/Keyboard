"use client";

import { useActionState, useCallback, useEffect, useRef, startTransition } from "react";
import { SONG_CATALOG, DEFAULT_SONG_ID } from "../model/songRegistry";

// L'action eseguita per ogni cambio di brano: prende l'id scelto, carica
// il seq via dynamic import, e restituisce il nuovo stato risolto.
// `previousState` (primo parametro dell'action) è ignorato di proposito -
// ogni caricamento riparte da zero, non è incrementale. Se l'id non
// corrisponde a nessun brano nel catalogo (in pratica non dovrebbe mai
// succedere, dato che gli id vengono dallo stesso catalogo che popola il
// <select>), restituisce lo stato precedente invariato invece di
// restare bloccato in pending per sempre.
async function loadSongAction(previousState, id) {
  const entry = SONG_CATALOG.find((s) => s.id === id);
  if (!entry) return previousState;

  try {
    const seq = await entry.load();
    return { selectedId: id, seq, error: null };
  } catch (err) {
    return { selectedId: id, seq: null, error: err };
  }
}

const INITIAL_RESULT = { selectedId: null, seq: null, error: null };

// La lista dei brani (solo metadati, niente seq) è disponibile subito.
// La `seq` del brano selezionato viene caricata on-demand con dynamic import.
export function useSongSelector() {
  // useActionState sostituisce sia lo stato di caricamento manuale
  // (result/loading derivato) sia il guard anti-stale (loadIdRef) della
  // versione precedente: se l'utente seleziona un nuovo brano mentre il
  // precedente sta ancora caricando, è React stesso a scartare il
  // risultato dell'azione più vecchia quando arriva - vedi
  // https://jsdev.space/mastering-useactionstate/. `isPending` sostituisce
  // il confronto result.resolvedFor !== selectedId di prima.
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
  // Avvolta qui, internamente, così SongSelectorPanel.js continua a
  // chiamare semplicemente setSelectedId(id) come prima, senza sapere
  // nulla di transition.
  const selectSong = useCallback(
    (id) => {
      startTransition(() => {
        dispatchLoad(id);
      });
    },
    [dispatchLoad],
  );

  // Le action non si auto-innescano al mount - serve comunque un effect
  // per il caricamento iniziale. A differenza di prima, però, è l'unico
  // effect rimasto: i cambi successivi passano tutti per selectSong
  // chiamato direttamente da SongSelectorPanel's onChange, nessun
  // effect osserva più selectedId per reagire ai cambi.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    startTransition(() => {
      dispatchLoad(DEFAULT_SONG_ID);
    });
  }, [dispatchLoad]);

  // `songs` contiene solo i metadati (id + label), adatti per il selettore UI.
  const songs = SONG_CATALOG.map(({ id, label }) => ({ id, label }));

  return {
    songs,
    selectedId: result.selectedId ?? DEFAULT_SONG_ID,
    // Stessa firma di setSelectedId(id) di prima (chiamata diretta con
    // l'id, nessun payload aggiuntivo) - resta compatibile con
    // SongSelectorPanel's onChange senza che quel file debba cambiare.
    setSelectedId: selectSong,
    seq: isPending ? null : result.seq,
    seqLoading: isPending,
    seqError: isPending ? null : result.error,
  };
}

export default useSongSelector;
