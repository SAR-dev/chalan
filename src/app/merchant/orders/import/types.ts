export type ImportPhase =
  | "idle"
  | "parsing"
  | "preview"
  | "submitting"
  | "done"
  | "error"

export type InputSource = "file" | "paste"
