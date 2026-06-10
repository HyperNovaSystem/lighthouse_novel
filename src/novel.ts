import { Has, createWorld, defineEvent, describeError, entry, type World } from '@domecs/core'
import {
  createMemoryStorage,
  load,
  pruneTransientOnlyEntities,
  save,
  type Storage,
} from '@domecs/persist'
import {
  Affinity,
  Character,
  ChoiceOption,
  CurrentBeat,
  GalleryUnlock,
  NovelConfig,
  SaveSlotView,
  SceneView,
  TextSurface,
  Transcript,
  ViewTag,
  type EndingId,
} from './components.js'
import {
  createLighthouseScript,
  type ChoiceCondition,
  type ChoiceEffect,
  type LighthouseScript,
  type StoryChoice,
  type StoryNode,
} from './script.js'

export const AdvanceTextEvent = defineEvent<Record<string, never>>('AdvanceText')
export const ChoiceSelectedEvent = defineEvent<{ choiceId: string }>('ChoiceSelected')
export const SaveRequestedEvent = defineEvent<{ slot: string; label?: string }>('SaveRequested')
export const LoadRequestedEvent = defineEvent<{ slot: string }>('LoadRequested')

export interface SaveSlotMeta {
  slot: string
  label: string
  thumbnail: string
  tick: number
  nodeId: string
}

export interface LighthouseNovelOptions {
  script?: LighthouseScript
  seed?: number
  headless?: boolean
  /** Save-slot backend. Defaults to an in-memory adapter (ephemeral session). */
  storage?: Storage
}

export interface LighthouseNovelRefs {
  world: World
  script: LighthouseScript
  storyId: number
  characterIds: readonly number[]
  characterIdsByName: ReadonlyMap<string, number>
  storage: Storage
  listSaves(): SaveSlotMeta[]
  visibleChoices(): string[]
  choose(choiceId: string): void
  save(slot: string, label?: string): void
  load(slot: string): void
  currentNode(): StoryNode
}

export function createLighthouseNovel(options: LighthouseNovelOptions = {}): LighthouseNovelRefs {
  const script = options.script ?? createLighthouseScript()
  const world = createWorld({
    seed: options.seed ?? 0x1194710,
    headless: options.headless ?? false,
    idle: true,
  })
  world.use(pruneTransientOnlyEntities())

  const storage = options.storage ?? createMemoryStorage()
  const characterIdsByName = new Map<string, number>()
  const characterIds: number[] = []
  let viewEntityIds: number[] = []

  const storyId = world.spawn([
    entry(NovelConfig, NovelConfig.create({ title: script.title, scriptSize: script.nodes.size })),
    entry(CurrentBeat, CurrentBeat.create({ nodeId: script.start })),
    entry(Transcript, Transcript.create()),
  ])

  for (const character of script.characters) {
    const id = world.spawn([
      entry(Character, Character.create(character)),
      entry(Affinity, Affinity.create({ value: 0 })),
    ])
    characterIds.push(id)
    characterIdsByName.set(character.name, id)
  }

  appendCurrentToTranscript()
  rebuildTransientViews()

  world.system('advance-dialogue', { schedule: 'event', triggers: [AdvanceTextEvent] }, (ctx) => {
    if (ctx.events.of(AdvanceTextEvent).length === 0) return
    const beat = beatState()
    const node = currentNode()
    if (node.choices && node.choices.length > 0) {
      beat.textRevealed = true
      world.markChanged(storyId, CurrentBeat)
      rebuildTransientViews()
      return
    }
    if (node.next) goToNode(node.next)
  })

  world.system('choose-branch', { schedule: 'event', triggers: [ChoiceSelectedEvent] }, (ctx) => {
    const events = ctx.events.of(ChoiceSelectedEvent)
    if (events.length === 0) return
    const node = currentNode()
    const available = availableChoices(node)
    for (const event of events) {
      const choice = available.find((candidate) => candidate.id === event.choiceId)
      if (!choice) continue
      applyEffects(choice.effects)
      goToNode(choice.to)
    }
  })

  world.system('save-slot', { schedule: 'event', triggers: [SaveRequestedEvent] }, (ctx) => {
    const events = ctx.events.of(SaveRequestedEvent)
    if (events.length === 0) return
    for (const event of events) {
      const node = currentNode()
      const result = save(world, storage, event.slot, {
        meta: {
          label: event.label ?? node.id,
          thumbnail: node.background,
          tick: world.time.tick,
          nodeId: node.id,
        },
      })
      if (!result.ok) logMessage(`Save to slot "${event.slot}" failed — ${describeError(result.error)}`)
    }
    rebuildTransientViews()
  })

  world.system('load-slot', { schedule: 'event', triggers: [LoadRequestedEvent] }, (ctx) => {
    const last = ctx.events.of(LoadRequestedEvent).at(-1)
    if (!last) return
    const result = load(world, storage, last.slot)
    if (!result.ok) logMessage(`Load from slot "${last.slot}" failed — ${describeError(result.error)}`)
    rebuildTransientViews()
  })

  function beatState(): ReturnType<typeof CurrentBeat.create> {
    const beat = world.getComponent(storyId, CurrentBeat)
    if (!beat) throw new Error('lighthouse_novel: missing CurrentBeat')
    return beat
  }

  function currentNode(): StoryNode {
    const nodeId = beatState().nodeId
    const node = script.nodes.get(nodeId)
    if (!node) throw new Error(`lighthouse_novel: missing script node ${nodeId}`)
    return node
  }

  function goToNode(nodeId: string): void {
    if (!script.nodes.has(nodeId)) throw new Error(`lighthouse_novel: cannot go to missing node ${nodeId}`)
    const beat = beatState()
    beat.nodeId = nodeId
    beat.textRevealed = true
    if (!beat.seenNodeIds.includes(nodeId)) beat.seenNodeIds.push(nodeId)
    inferEndingFromNode(nodeId, beat)
    world.markChanged(storyId, CurrentBeat)
    appendCurrentToTranscript()
    rebuildTransientViews()
  }

  function appendCurrentToTranscript(): void {
    const beat = beatState()
    const node = currentNode()
    if (!beat.seenNodeIds.includes(node.id)) beat.seenNodeIds.push(node.id)
    const transcript = world.getComponent(storyId, Transcript)
    if (!transcript) return
    const last = transcript.lines.at(-1)
    if (last?.nodeId === node.id) return
    transcript.lines.push({ nodeId: node.id, speaker: node.speaker, text: node.text })
    world.markChanged(storyId, Transcript)
    world.markChanged(storyId, CurrentBeat)
  }

  function availableChoices(node: StoryNode = currentNode()): StoryChoice[] {
    return (node.choices ?? []).filter((choice) => conditionsPass(choice.conditions ?? []))
  }

  function conditionsPass(conditions: ChoiceCondition[]): boolean {
    const beat = beatState()
    for (const condition of conditions) {
      if (condition.flag && !beat.flags.includes(condition.flag)) return false
      if (condition.notFlag && beat.flags.includes(condition.notFlag)) return false
      if (condition.affinityAtLeast) {
        const id = characterIdsByName.get(condition.affinityAtLeast.character)
        const value = id === undefined ? undefined : world.getComponent(id, Affinity)?.value
        if (value === undefined || value < condition.affinityAtLeast.value) return false
      }
    }
    return true
  }

  function applyEffects(effects: ChoiceEffect | undefined): void {
    if (!effects) return
    const beat = beatState()
    for (const flag of effects.addFlags ?? []) {
      if (!beat.flags.includes(flag)) beat.flags.push(flag)
    }
    if (effects.ending) beat.ending = effects.ending
    world.markChanged(storyId, CurrentBeat)

    for (const [name, delta] of Object.entries(effects.affinity ?? {})) {
      const id = characterIdsByName.get(name)
      if (id === undefined) continue
      const affinity = world.getComponent(id, Affinity)
      if (!affinity) continue
      affinity.value += delta
      world.markChanged(id, Affinity)
    }

    if (effects.gallery && !hasGalleryUnlock(effects.gallery.key)) {
      world.spawn([
        entry(GalleryUnlock, GalleryUnlock.create(effects.gallery)),
      ])
    }
  }

  function inferEndingFromNode(nodeId: string, beat: ReturnType<typeof CurrentBeat.create>): void {
    if (nodeId === 'ending.harbor_lights') beat.ending = 'harbor_lights'
    else if (nodeId === 'ending.sealed_tower') beat.ending = 'sealed_tower'
    else if (nodeId === 'ending.open_sea') beat.ending = 'open_sea'
  }

  function logMessage(text: string): void {
    const transcript = world.getComponent(storyId, Transcript)
    if (!transcript) return
    transcript.lines.push({ nodeId: 'system.message', speaker: 'System', text })
    world.markChanged(storyId, Transcript)
  }

  function readSlotMeta(slot: string): SaveSlotMeta | null {
    const read = storage.read(slot)
    if (!read.ok || read.value === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(read.value)
    } catch {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const meta = (parsed as { meta?: Record<string, unknown> }).meta ?? {}
    return {
      slot,
      label: typeof meta.label === 'string' ? meta.label : slot,
      thumbnail: typeof meta.thumbnail === 'string' ? meta.thumbnail : '',
      tick: typeof meta.tick === 'number' ? meta.tick : 0,
      nodeId: typeof meta.nodeId === 'string' ? meta.nodeId : '',
    }
  }

  function listSaveSlots(): SaveSlotMeta[] {
    const listed = storage.list()
    if (!listed.ok) return []
    const out: SaveSlotMeta[] = []
    for (const slot of listed.value) {
      const meta = readSlotMeta(slot)
      if (meta) out.push(meta)
    }
    return out
  }

  function hasGalleryUnlock(key: string): boolean {
    for (const entity of world.query(Has(GalleryUnlock)).entities) {
      if (world.getComponent(entity.id, GalleryUnlock)?.key === key) return true
    }
    return false
  }

  function rebuildTransientViews(): void {
    for (const id of viewEntityIds) world.despawn(id)
    viewEntityIds = []
    const node = currentNode()
    const transcript = world.getComponent(storyId, Transcript)

    spawnView([
      entry(ViewTag, ViewTag.create({ slot: 'background', key: node.background, index: 0 })),
      entry(SceneView, SceneView.create({ background: node.background, portraitNames: node.portraits })),
    ])

    for (const [index, name] of node.portraits.entries()) {
      spawnView([
        entry(ViewTag, ViewTag.create({ slot: 'portrait', key: name, index })),
        entry(SceneView, SceneView.create({ background: node.background, portraitNames: [name] })),
      ])
    }

    spawnView([
      entry(ViewTag, ViewTag.create({ slot: 'dialogue', key: node.id, index: 0 })),
      entry(TextSurface, TextSurface.create({
        nodeId: node.id,
        speaker: node.speaker,
        text: node.text,
        revealedCharacters: node.text.length,
        totalCharacters: node.text.length,
      })),
    ])

    availableChoices(node).forEach((choice, index) => {
      spawnView([
        entry(ViewTag, ViewTag.create({ slot: 'choice', key: choice.id, index })),
        entry(ChoiceOption, ChoiceOption.create({ choiceId: choice.id, label: choice.label, enabled: true, index })),
      ])
    })

    for (const [index, line] of (transcript?.lines ?? []).slice(-12).entries()) {
      spawnView([
        entry(ViewTag, ViewTag.create({ slot: 'transcript', key: line.nodeId, index })),
      ])
    }

    let galleryIndex = 0
    for (const entity of world.query(Has(GalleryUnlock)).entities) {
      const unlock = world.getComponent(entity.id, GalleryUnlock)
      if (!unlock) continue
      spawnView([
        entry(ViewTag, ViewTag.create({ slot: 'gallery', key: unlock.key, index: galleryIndex++ })),
      ])
    }

    let saveIndex = 0
    for (const meta of listSaveSlots()) {
      spawnView([
        entry(ViewTag, ViewTag.create({ slot: 'save', key: meta.slot, index: saveIndex++ })),
        entry(SaveSlotView, SaveSlotView.create({
          slot: meta.slot,
          label: meta.label,
          thumbnail: meta.thumbnail,
          tick: meta.tick,
        })),
      ])
    }
  }

  function spawnView(components: Parameters<typeof world.spawn>[0]): number {
    const id = world.spawn(components)
    viewEntityIds.push(id)
    return id
  }

  const refs: LighthouseNovelRefs = {
    world,
    script,
    storyId,
    characterIds,
    characterIdsByName,
    storage,
    listSaves() {
      return listSaveSlots()
    },
    visibleChoices() {
      return world.query(Has(ChoiceOption)).entities
        .map((entity) => world.getComponent(entity.id, ChoiceOption))
        .filter((choice): choice is ReturnType<typeof ChoiceOption.create> => Boolean(choice))
        .sort((a, b) => a.index - b.index)
        .map((choice) => choice.label)
    },
    choose(choiceId: string) {
      world.emit(ChoiceSelectedEvent, { choiceId })
    },
    save(slot: string, label?: string) {
      world.emit(SaveRequestedEvent, label === undefined ? { slot } : { slot, label })
    },
    load(slot: string) {
      world.emit(LoadRequestedEvent, { slot })
    },
    currentNode,
  }

  return refs
}

export function endingLabel(ending: EndingId | null): string {
  if (ending === 'harbor_lights') return 'Harbor Lights'
  if (ending === 'sealed_tower') return 'The Sealed Tower'
  if (ending === 'open_sea') return 'Open Sea'
  return 'Undetermined'
}
