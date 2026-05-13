import { describe, expect, it } from 'vitest'
import { Has } from '@domecs/core'
import {
  AdvanceTextEvent,
  Affinity,
  Character,
  ChoiceOption,
  ChoiceSelectedEvent,
  CurrentBeat,
  GalleryUnlock,
  LoadRequestedEvent,
  NovelConfig,
  SaveRequestedEvent,
  TextSurface,
  Transcript,
  ViewTag,
  createLighthouseNovel,
  createLighthouseScript,
} from '../src/index.js'

describe('The Lighthouse Correspondence exemplar', () => {
  it('keeps the 2k-node narrative graph as data, not entities', () => {
    const script = createLighthouseScript({ fillerNodeCount: 2_050 })
    const refs = createLighthouseNovel({ script, headless: true })

    expect(script.nodes.size).toBeGreaterThanOrEqual(2_000)
    expect(refs.characterIds).toHaveLength(40)
    expect(refs.world.query(Has(Character)).size).toBe(40)
    expect(refs.world.query(Has(CurrentBeat)).size).toBe(1)
    expect(refs.world.query(Has(NovelConfig)).size).toBe(1)
    expect(refs.world.snapshot().entities.length).toBeLessThan(80)
  })

  it('advances through event systems and records a transcript backlog', () => {
    const refs = createLighthouseNovel({ headless: true })
    const beat = () => refs.world.getComponent(refs.storyId, CurrentBeat)!

    expect(beat().nodeId).toBe('prologue.arrival')
    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()
    expect(beat().nodeId).toBe('prologue.lamp')

    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()
    expect(beat().nodeId).toBe('choice.first_signal')
    expect(refs.visibleChoices()).toEqual(['Answer with the keeper\'s code', 'Keep the lantern dark'])

    const transcript = refs.world.getComponent(refs.storyId, Transcript)!
    expect(transcript.lines.map((line) => line.nodeId)).toContain('prologue.arrival')
    expect(transcript.lines.length).toBeGreaterThanOrEqual(2)
  })

  it('applies branch conditions, affinity changes, flags, endings, and gallery unlocks', () => {
    const refs = createLighthouseNovel({ headless: true })
    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()
    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()

    const firstChoices = refs.visibleChoices()
    expect(firstChoices).toHaveLength(2)
    refs.world.emit(ChoiceSelectedEvent, { choiceId: 'answer-code' })
    refs.world.step()

    const keeperId = refs.characterIdsByName.get('Mara Vale')!
    const affinity = refs.world.getComponent(keeperId, Affinity)!
    const beat = refs.world.getComponent(refs.storyId, CurrentBeat)!
    expect(affinity.value).toBeGreaterThan(0)
    expect(beat.flags).toContain('answered_keeper_code')

    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()
    refs.world.emit(ChoiceSelectedEvent, { choiceId: 'trust-mara' })
    refs.world.step()

    const finalBeat = refs.world.getComponent(refs.storyId, CurrentBeat)!
    expect(finalBeat.ending).toBe('harbor_lights')
    expect(refs.world.query(Has(GalleryUnlock)).size).toBeGreaterThanOrEqual(1)
  })

  it('stores named snapshot slots and restores story state while rebuilding transient views', () => {
    const refs = createLighthouseNovel({ headless: true })
    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()
    refs.world.emit(SaveRequestedEvent, { slot: 'before-choice', label: 'Before first signal' })
    refs.world.step()

    const saved = refs.saveSlots.get('before-choice')
    expect(saved?.label).toBe('Before first signal')
    expect(saved?.thumbnail).toContain('lighthouse')

    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()
    refs.world.emit(ChoiceSelectedEvent, { choiceId: 'keep-dark' })
    refs.world.step()
    expect(refs.world.getComponent(refs.storyId, CurrentBeat)!.nodeId).toBe('route.silence')

    refs.world.emit(LoadRequestedEvent, { slot: 'before-choice' })
    refs.world.step()

    expect(refs.world.getComponent(refs.storyId, CurrentBeat)!.nodeId).toBe('prologue.lamp')
    expect(refs.world.query(Has(ViewTag)).size).toBeGreaterThan(0)
    expect(refs.world.query(Has(TextSurface)).size).toBe(1)
    expect(refs.visibleChoices()).toHaveLength(0)
  })

  it('omits transient text and choice view components from saves', () => {
    const refs = createLighthouseNovel({ headless: true })
    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()
    refs.world.emit(AdvanceTextEvent, {})
    refs.world.step()

    expect(refs.world.query(Has(ChoiceOption)).size).toBe(2)
    const snapshot = refs.world.snapshot()
    expect(snapshot.entities.every((entity) => Object.keys(entity.components).length > 0)).toBe(true)
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('TextSurface')
    expect(serialized).not.toContain('ChoiceOption')
    expect(serialized).not.toContain('ViewTag')
    expect(serialized).toContain('CurrentBeat')
    expect(serialized).toContain('Transcript')
  })
})
