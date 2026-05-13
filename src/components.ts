import { defineComponent } from '@domecs/core'

export type EndingId = 'harbor_lights' | 'sealed_tower' | 'open_sea'
export type ViewSlot = 'background' | 'portrait' | 'dialogue' | 'choice' | 'transcript' | 'gallery' | 'save'

export interface TranscriptLine {
  nodeId: string
  speaker: string | null
  text: string
}

function nonNegativeInteger(name: string, value: number): true | string {
  return Number.isInteger(value) && value >= 0 ? true : `${name} must be a non-negative integer`
}

function finite(name: string, value: number): true | string {
  return Number.isFinite(value) ? true : `${name} must be finite`
}

export const NovelConfig = defineComponent<{
  title: string
  scriptSize: number
  idleTickSuspension: boolean
  eventDriven: boolean
}>('NovelConfig', {
  defaults: {
    title: 'The Lighthouse Correspondence',
    scriptSize: 0,
    idleTickSuspension: true,
    eventDriven: true,
  },
  validate: (value) => nonNegativeInteger('scriptSize', value.scriptSize),
})

export const CurrentBeat = defineComponent<{
  nodeId: string
  flags: string[]
  seenNodeIds: string[]
  ending: EndingId | null
  textRevealed: boolean
}>('CurrentBeat', {
  defaults: {
    nodeId: 'prologue.arrival',
    flags: [],
    seenNodeIds: [],
    ending: null,
    textRevealed: true,
  },
})

export const Transcript = defineComponent<{
  lines: TranscriptLine[]
}>('Transcript', {
  defaults: { lines: [] },
})

export const Character = defineComponent<{
  name: string
  role: string
  pronouns: string
  color: string
}>('Character', {
  defaults: { name: '', role: 'correspondent', pronouns: 'they/them', color: '#f3d28b' },
})

export const Affinity = defineComponent<{
  value: number
}>('Affinity', {
  defaults: { value: 0 },
  validate: (value) => finite('affinity', value.value),
})

export const GalleryUnlock = defineComponent<{
  key: string
  title: string
  thumbnail: string
}>('GalleryUnlock', {
  defaults: { key: '', title: '', thumbnail: '' },
})

export const ViewTag = defineComponent<{
  slot: ViewSlot
  key: string
  index: number
}>('ViewTag', {
  defaults: { slot: 'dialogue', key: '', index: 0 },
  transient: true,
  validate: (value) => nonNegativeInteger('view index', value.index),
})

export const SceneView = defineComponent<{
  background: string
  portraitNames: string[]
}>('SceneView', {
  defaults: { background: 'lighthouse-dawn', portraitNames: [] },
  transient: true,
})

export const TextSurface = defineComponent<{
  nodeId: string
  speaker: string | null
  text: string
  revealedCharacters: number
  totalCharacters: number
}>('TextSurface', {
  defaults: { nodeId: '', speaker: null, text: '', revealedCharacters: 0, totalCharacters: 0 },
  transient: true,
  validate: (value) => {
    const revealed = nonNegativeInteger('revealedCharacters', value.revealedCharacters)
    if (revealed !== true) return revealed
    return nonNegativeInteger('totalCharacters', value.totalCharacters)
  },
})

export const ChoiceOption = defineComponent<{
  choiceId: string
  label: string
  enabled: boolean
  index: number
}>('ChoiceOption', {
  defaults: { choiceId: '', label: '', enabled: true, index: 0 },
  transient: true,
  validate: (value) => nonNegativeInteger('choice index', value.index),
})

export const SaveSlotView = defineComponent<{
  slot: string
  label: string
  thumbnail: string
  tick: number
}>('SaveSlotView', {
  defaults: { slot: '', label: '', thumbnail: '', tick: 0 },
  transient: true,
  validate: (value) => nonNegativeInteger('slot tick', value.tick),
})
