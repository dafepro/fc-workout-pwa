interface ProtocolMessage {
  type: string;
  session?: string;
  host?: string | null;
  epoch?: number;
  sequence?: number;
  input?: { kick?: boolean };
  inputAcks?: Record<string, number>;
  state?: { players: Record<string, { kick?: number }> };
}

export function createWorldProtocolProbe(stage: () => string, now = Date.now) {
  const started = now();
  let session: string | undefined;
  let connection = 0;
  let hostExists: boolean | undefined;
  let isHost: boolean | undefined;
  let epoch: number | undefined;
  let kickInputs = 0;
  let localKickSnapshots = 0;
  let peerKickSnapshots = 0;
  const stamp = () => ({ stage: stage(), afterMs: now() - started });
  const transitions: {
    stage: string;
    afterMs: number;
    epoch: number | undefined;
    hostExists: boolean;
    isHost: boolean;
  }[] = [];
  const kicks: {
    stage: string;
    afterMs: number;
    sequence: number;
    connection: number;
    epoch: number | undefined;
    acknowledged: boolean;
  }[] = [];
  return {
    kickCount: () => kickInputs,
    sent(m: ProtocolMessage) {
      if (
        m.type === "input" &&
        m.input?.kick === true &&
        Number.isSafeInteger(m.sequence) &&
        m.sequence! >= 0
      ) {
        kickInputs++;
        kicks.push({
          ...stamp(),
          sequence: m.sequence!,
          connection,
          epoch,
          acknowledged: false,
        });
        if (kicks.length > 16) kicks.shift();
      }
    },
    received(m: ProtocolMessage) {
      if (m.type === "welcome") {
        session = m.session;
        connection++;
      }
      if (m.type === "room") {
        const nextHostExists = Boolean(m.host);
        const nextIsHost = Boolean(session && m.host === session);
        if (
          epoch !== m.epoch ||
          isHost !== nextIsHost ||
          hostExists !== nextHostExists
        ) {
          epoch = m.epoch;
          hostExists = nextHostExists;
          isHost = nextIsHost;
          transitions.push({ ...stamp(), epoch, hostExists, isHost });
          if (transitions.length > 40) transitions.shift();
        }
      }
      const ack = session && m.inputAcks?.[session];
      if (typeof ack === "number" && Number.isSafeInteger(ack))
        for (const kick of kicks)
          if (kick.connection === connection && ack >= kick.sequence)
            kick.acknowledged = true;
      if (m.state && session) {
        if ((m.state.players[session]?.kick ?? 0) > 0) localKickSnapshots++;
        if (
          Object.entries(m.state.players).some(
            ([id, player]) => id !== session && (player.kick ?? 0) > 0,
          )
        )
          peerKickSnapshots++;
      }
    },
    snapshot: () => ({
      hostExists,
      isHost,
      epoch,
      kickInputs,
      localKickSnapshots,
      peerKickSnapshots,
      transitions,
      kicks,
    }),
  };
}
