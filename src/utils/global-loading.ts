import { reactive } from 'vue'

interface GlobalLoadingState {
  visible: boolean
  text: string
  count: number
}

const state = reactive<GlobalLoadingState>({
  visible: false,
  text: '加载中…',
  count: 0,
})

const SHOW_DELAY = 200
const HIDE_DELAY = 200

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearShowTimer() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

export function showLoading(text = '加载中…') {
  state.text = text
  state.count += 1
  clearShowTimer()
  clearHideTimer()
  showTimer = setTimeout(() => {
    showTimer = null
    if (state.count > 0) state.visible = true
  }, SHOW_DELAY)
}

export function hideLoading() {
  if (state.count <= 0) return
  state.count -= 1
  if (state.count > 0) return
  clearShowTimer()
  clearHideTimer()
  hideTimer = setTimeout(() => {
    hideTimer = null
    if (state.count === 0) state.visible = false
  }, HIDE_DELAY)
}

export function useGlobalLoading() {
  return { state, showLoading, hideLoading }
}
