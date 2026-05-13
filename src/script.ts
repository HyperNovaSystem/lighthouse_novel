import type { EndingId } from './components.js'

export interface CharacterDef {
  name: string
  role: string
  pronouns: string
  color: string
}

export interface ChoiceCondition {
  flag?: string
  notFlag?: string
  affinityAtLeast?: { character: string; value: number }
}

export interface ChoiceEffect {
  addFlags?: string[]
  affinity?: Record<string, number>
  ending?: EndingId
  gallery?: { key: string; title: string; thumbnail: string }
}

export interface StoryChoice {
  id: string
  label: string
  to: string
  conditions?: ChoiceCondition[]
  effects?: ChoiceEffect
}

export interface StoryNode {
  id: string
  speaker: string | null
  text: string
  background: string
  portraits: string[]
  next?: string
  choices?: StoryChoice[]
}

export interface LighthouseScript {
  title: string
  start: string
  characters: CharacterDef[]
  nodes: Map<string, StoryNode>
}

export interface LighthouseScriptOptions {
  fillerNodeCount?: number
}

const HEROES: CharacterDef[] = [
  { name: 'Mara Vale', role: 'lighthouse keeper', pronouns: 'she/her', color: '#f5c16c' },
  { name: 'Elias Rook', role: 'cartographer', pronouns: 'he/him', color: '#8fd3ff' },
  { name: 'Jun Bell', role: 'radio operator', pronouns: 'they/them', color: '#c4f08f' },
  { name: 'Helena Quill', role: 'archivist', pronouns: 'she/her', color: '#d9b8ff' },
  { name: 'Noor Ash', role: 'fisher', pronouns: 'she/they', color: '#ff9faa' },
]

export function createLighthouseScript(options: LighthouseScriptOptions = {}): LighthouseScript {
  const fillerNodeCount = options.fillerNodeCount ?? 2_000
  const characters = createCharacters()
  const nodes = new Map<string, StoryNode>()

  for (const node of coreNodes()) nodes.set(node.id, node)
  for (let i = 0; i < fillerNodeCount; i++) {
    const id = `archive.letter.${String(i + 1).padStart(4, '0')}`
    const speaker = characters[(i + HEROES.length) % characters.length]?.name ?? 'Archivist'
    const fillerNode: StoryNode = {
      id,
      speaker,
      text: `Recovered letter ${i + 1}: the sea repeats every secret until someone answers.`,
      background: i % 2 === 0 ? 'archive-blueprint' : 'fogbound-postmark',
      portraits: [speaker],
    }
    if (i + 1 < fillerNodeCount) fillerNode.next = `archive.letter.${String(i + 2).padStart(4, '0')}`
    nodes.set(id, fillerNode)
  }

  return {
    title: 'The Lighthouse Correspondence',
    start: 'prologue.arrival',
    characters,
    nodes,
  }
}

function coreNodes(): StoryNode[] {
  return [
    {
      id: 'prologue.arrival',
      speaker: null,
      text: 'The ferry leaves you beneath a white tower, a bruised sky, and forty years of unanswered letters.',
      background: 'lighthouse-dawn',
      portraits: [],
      next: 'prologue.lamp',
    },
    {
      id: 'prologue.lamp',
      speaker: 'Mara Vale',
      text: 'If the lantern blinks twice tonight, answer with the keeper\'s code. If it does not, forget this island found you.',
      background: 'lighthouse-lantern-room',
      portraits: ['Mara Vale'],
      next: 'choice.first_signal',
    },
    {
      id: 'choice.first_signal',
      speaker: null,
      text: 'Night folds around the tower. The lamp coughs once, twice, then waits for your hand.',
      background: 'lighthouse-night',
      portraits: ['Mara Vale', 'Elias Rook'],
      choices: [
        {
          id: 'answer-code',
          label: "Answer with the keeper's code",
          to: 'route.code',
          effects: {
            addFlags: ['answered_keeper_code'],
            affinity: { 'Mara Vale': 2, 'Elias Rook': 1 },
          },
        },
        {
          id: 'keep-dark',
          label: 'Keep the lantern dark',
          to: 'route.silence',
          effects: {
            addFlags: ['kept_lantern_dark'],
            affinity: { 'Mara Vale': -1, 'Helena Quill': 1 },
          },
        },
      ],
    },
    {
      id: 'route.code',
      speaker: 'Elias Rook',
      text: 'Across the bay an answering light draws a map no compass would confess to knowing.',
      background: 'harbor-signal',
      portraits: ['Elias Rook', 'Mara Vale'],
      next: 'choice.trust_mara',
    },
    {
      id: 'choice.trust_mara',
      speaker: 'Mara Vale',
      text: 'I can open the sealed gallery below the lens, but only if you trust me with the original letter.',
      background: 'lens-gallery',
      portraits: ['Mara Vale'],
      choices: [
        {
          id: 'trust-mara',
          label: 'Give Mara the original letter',
          to: 'ending.harbor_lights',
          conditions: [
            { flag: 'answered_keeper_code' },
            { affinityAtLeast: { character: 'Mara Vale', value: 2 } },
          ],
          effects: {
            addFlags: ['trusted_mara'],
            affinity: { 'Mara Vale': 3 },
            ending: 'harbor_lights',
            gallery: {
              key: 'cg.harbor_lights',
              title: 'Harbor Lights',
              thumbnail: 'thumbnail-harbor-lights',
            },
          },
        },
        {
          id: 'withhold-letter',
          label: 'Withhold the letter and copy the map',
          to: 'ending.open_sea',
          effects: {
            addFlags: ['copied_map'],
            ending: 'open_sea',
            gallery: {
              key: 'cg.open_sea',
              title: 'Open Sea',
              thumbnail: 'thumbnail-open-sea',
            },
          },
        },
      ],
    },
    {
      id: 'route.silence',
      speaker: 'Helena Quill',
      text: 'Silence is a choice too. In the archive, every unopened envelope grows teeth.',
      background: 'archive-candles',
      portraits: ['Helena Quill'],
      next: 'ending.sealed_tower',
    },
    {
      id: 'ending.harbor_lights',
      speaker: null,
      text: 'By dawn, every ship in the harbor burns with a borrowed star, and the letters finally have somewhere to go.',
      background: 'harbor-lights',
      portraits: ['Mara Vale', 'Elias Rook', 'Jun Bell'],
    },
    {
      id: 'ending.sealed_tower',
      speaker: null,
      text: 'The tower seals itself before sunrise. Years later, a new ferry brings someone who looks too much like you.',
      background: 'sealed-tower',
      portraits: ['Helena Quill'],
    },
    {
      id: 'ending.open_sea',
      speaker: null,
      text: 'You sail beyond the last chart and learn the lighthouse was never warning ships away. It was calling them home.',
      background: 'open-sea',
      portraits: ['Elias Rook'],
    },
  ]
}

function createCharacters(): CharacterDef[] {
  const roles = ['correspondent', 'keeper', 'sailor', 'archivist', 'visitor', 'ghost', 'mechanic', 'poet']
  const colors = ['#f5c16c', '#8fd3ff', '#c4f08f', '#d9b8ff', '#ff9faa', '#f7f0a3', '#99ffe4', '#ffbf80']
  const out = [...HEROES]
  for (let i = out.length; i < 40; i++) {
    out.push({
      name: `Correspondent ${String(i + 1).padStart(2, '0')}`,
      role: roles[i % roles.length] ?? 'correspondent',
      pronouns: i % 3 === 0 ? 'she/her' : i % 3 === 1 ? 'he/him' : 'they/them',
      color: colors[i % colors.length] ?? '#f3d28b',
    })
  }
  return out
}
