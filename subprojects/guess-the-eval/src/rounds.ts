// Shared round length: both a solo round and a PvP match are five positions (user feedback,
// 2026-09-16, item 4: "so scores are comparable between people" — PvP needs the same count for
// the same reason, since both players see the same five). One constant so SoloRound and
// PvpRound can't drift apart. First guess, not researched; tune once there is a sense of how
// long a round should feel.
export const ROUNDS = 5;
