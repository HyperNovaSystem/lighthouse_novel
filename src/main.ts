import { And, Has, Where, type EntityView } from '@domecs/core'
import { defineView, mountDOM } from '@domecs/dom'
import {
  AdvanceTextEvent,
  ChoiceOption,
  ChoiceSelectedEvent,
  CurrentBeat,
  GalleryUnlock,
  LoadRequestedEvent,
  SaveRequestedEvent,
  SaveSlotView,
  SceneView,
  TextSurface,
  Transcript,
  ViewTag,
  createLighthouseNovel,
  endingLabel,
} from './index.js'
import './style.css'

const slots = {
  background: must('background'),
  portraits: must('portraits'),
  dialogue: must('dialogue'),
  choices: must('choices'),
  transcript: must('transcript'),
  gallery: must('gallery'),
  saves: must('saves'),
}
const advanceButton = must('advance') as HTMLButtonElement
const saveButton = must('save') as HTMLButtonElement
const loadButton = must('load') as HTMLButtonElement
const statusEl = must('status')

const refs = createLighthouseNovel({})
const { world } = refs

const backgroundView = defineView({
  slot: 'background',
  query: And(Has(SceneView), Where(ViewTag, (tag) => tag.slot === 'background')),
  changedOn: [SceneView, ViewTag],
  create(entity) {
    const el = document.createElement('div')
    el.className = 'scene-bg'
    paintScene(el, entity)
    return el
  },
  update: paintScene,
})

const portraitView = defineView({
  slot: 'portraits',
  query: And(Has(SceneView), Where(ViewTag, (tag) => tag.slot === 'portrait')),
  changedOn: [SceneView, ViewTag],
  create(entity) {
    const el = document.createElement('div')
    el.className = 'portrait'
    paintPortrait(el, entity)
    return el
  },
  update: paintPortrait,
})

const dialogueView = defineView({
  slot: 'dialogue',
  query: Has(TextSurface),
  changedOn: [TextSurface],
  create(entity) {
    const el = document.createElement('article')
    el.className = 'dialogue-box'
    paintDialogue(el, entity)
    return el
  },
  update: paintDialogue,
})

const choiceView = defineView({
  slot: 'choices',
  query: Has(ChoiceOption),
  changedOn: [ChoiceOption],
  create(entity) {
    const button = document.createElement('button')
    button.className = 'choice'
    paintChoice(button, entity)
    return button
  },
  update: paintChoice,
})

const saveView = defineView({
  slot: 'saves',
  query: Has(SaveSlotView),
  changedOn: [SaveSlotView],
  create(entity) {
    const button = document.createElement('button')
    button.className = 'save-slot'
    paintSave(button, entity)
    return button
  },
  update: paintSave,
})

mountDOM(world, {
  slots: {
    background: slots.background,
    portraits: slots.portraits,
    dialogue: slots.dialogue,
    choices: slots.choices,
    saves: slots.saves,
  },
  views: [backgroundView, portraitView, dialogueView, choiceView, saveView],
})

advanceButton.addEventListener('click', () => world.emit(AdvanceTextEvent, {}))
saveButton.addEventListener('click', () => world.emit(SaveRequestedEvent, { slot: 'quick', label: 'Quick save' }))
loadButton.addEventListener('click', () => world.emit(LoadRequestedEvent, { slot: 'quick' }))
document.addEventListener('keydown', (event) => {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    world.emit(AdvanceTextEvent, {})
  }
  if (event.key.toLowerCase() === 's') world.emit(SaveRequestedEvent, { slot: 'quick', label: 'Quick save' })
  if (event.key.toLowerCase() === 'l') world.emit(LoadRequestedEvent, { slot: 'quick' })
})

world.signals.tickEnd.subscribe(() => {
  paintTranscript()
  paintGallery()
  paintStatus()
})

world.step(0)
paintTranscript()
paintGallery()
paintStatus()
world.start({ dtClampMs: 50 })

function paintScene(el: HTMLElement, entity: EntityView): void {
  const tag = world.getComponent(entity.id, ViewTag)
  const scene = world.getComponent(entity.id, SceneView)
  if (!tag || !scene) return
  el.dataset.scene = scene.background
  el.textContent = scene.background.replaceAll('-', ' ')
}

function paintPortrait(el: HTMLElement, entity: EntityView): void {
  const tag = world.getComponent(entity.id, ViewTag)
  const scene = world.getComponent(entity.id, SceneView)
  if (!tag || !scene) return
  const name = scene.portraitNames[0] ?? 'Unknown'
  el.textContent = name
  el.style.setProperty('--portrait-index', String(tag.index))
}

function paintDialogue(el: HTMLElement, entity: EntityView): void {
  const text = world.getComponent(entity.id, TextSurface)
  if (!text) return
  el.innerHTML = `<h2>${text.speaker ?? 'Narration'}</h2><p>${escapeHtml(text.text)}</p>`
}

function paintChoice(button: HTMLButtonElement, entity: EntityView): void {
  const choice = world.getComponent(entity.id, ChoiceOption)
  if (!choice) return
  button.textContent = choice.label
  button.disabled = !choice.enabled
  button.onclick = () => world.emit(ChoiceSelectedEvent, { choiceId: choice.choiceId })
}

function paintSave(button: HTMLButtonElement, entity: EntityView): void {
  const slot = world.getComponent(entity.id, SaveSlotView)
  if (!slot) return
  button.innerHTML = `<strong>${escapeHtml(slot.label)}</strong><span>${escapeHtml(slot.thumbnail)} · tick ${slot.tick}</span>`
  button.onclick = () => world.emit(LoadRequestedEvent, { slot: slot.slot })
}

function paintTranscript(): void {
  const transcript = world.getComponent(refs.storyId, Transcript)
  slots.transcript.innerHTML = (transcript?.lines ?? []).slice(-8).map((line) => (
    `<li><b>${escapeHtml(line.speaker ?? 'Narration')}</b> ${escapeHtml(line.text)}</li>`
  )).join('')
}

function paintGallery(): void {
  const rows = world.query(Has(GalleryUnlock)).entities
    .map((entity) => world.getComponent(entity.id, GalleryUnlock))
    .filter((unlock): unlock is ReturnType<typeof GalleryUnlock.create> => Boolean(unlock))
  slots.gallery.innerHTML = rows.length === 0
    ? '<li>Locked CGs will appear here.</li>'
    : rows.map((unlock) => `<li><strong>${escapeHtml(unlock.title)}</strong><span>${escapeHtml(unlock.thumbnail)}</span></li>`).join('')
}

function paintStatus(): void {
  const beat = world.getComponent(refs.storyId, CurrentBeat)
  statusEl.textContent = beat
    ? `${beat.nodeId} · ending: ${endingLabel(beat.ending)} · flags: ${beat.flags.length}`
    : 'loading'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char] ?? char))
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el
}
