import type { InterpretationMethod } from '../../work02/interpretation/types'
import type { ScheduledAudioNote } from '../../work02/audio/types'
import type { AudioPlaybackProfileSnapshot } from '../../work02/audio/profile'
import type { AUDIO_PLAYBACK_PROFILE_VERSION } from '../../work02/versions'
import type { GrammarProfileId } from '../grammar/types'
import type {
  WORK03_AUDIO_ADAPTER_VERSION,
  WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION,
  WORK03_GRAMMAR_GENERATOR_VERSION,
  WORK03_MELODY_OUTPUT_CONTRACT_VERSION,
  WORK03_MUSIC_GRAMMAR_VERSION,
} from '../versions'

/**
 * Work 03 deliberately reuses the proven note projection shape without
 * claiming that its schedule is a Work 02 schedule.
 */
export type Work03ScheduledAudioNote = Readonly<ScheduledAudioNote>

export interface Work03AudioScheduleVersions {
  readonly scheduleContract: typeof WORK03_AUDIO_SCHEDULE_CONTRACT_VERSION
  readonly adapter: typeof WORK03_AUDIO_ADAPTER_VERSION
  readonly playbackProfile: typeof AUDIO_PLAYBACK_PROFILE_VERSION
  readonly melodyOutputContract: typeof WORK03_MELODY_OUTPUT_CONTRACT_VERSION
  readonly melodyGenerator: typeof WORK03_GRAMMAR_GENERATOR_VERSION
  readonly musicGrammar: typeof WORK03_MUSIC_GRAMMAR_VERSION
}

export interface Work03AudioScheduleSource {
  readonly profile: GrammarProfileId
  readonly seed: string
}

/**
 * A Work 03-owned, JSON-safe playback projection. Work 02's immutable default
 * playback profile is reused verbatim, while all source contract identifiers
 * remain truthfully labelled as Work 03.
 */
export interface Work03AudioSchedule {
  readonly versions: Readonly<Work03AudioScheduleVersions>
  readonly source: Readonly<Work03AudioScheduleSource>
  readonly method: InterpretationMethod
  readonly profile: AudioPlaybackProfileSnapshot
  readonly tempoBpm: number
  readonly totalBeats: 12
  readonly totalDurationSeconds: number
  readonly notes: readonly Work03ScheduledAudioNote[]
}
