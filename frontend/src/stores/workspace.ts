import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Dashboard } from '@/types'

export const useWorkspaceStore = defineStore('workspace', () => {
  const dashboard = ref<Dashboard | null>(null)
  const loading = ref(false)
  const error = ref('')

  let inflight: Promise<void> | null = null

  async function load(force = false): Promise<void> {
    if (!force && dashboard.value) return
    if (inflight) return inflight

    loading.value = true
    inflight = api
      .getDashboard()
      .then((data) => {
        dashboard.value = data
        error.value = ''
      })
      .catch((err: unknown) => {
        error.value = err instanceof Error ? err.message : '工作台加载失败'
      })
      .finally(() => {
        loading.value = false
        inflight = null
      })

    return inflight
  }

  return { dashboard, loading, error, load }
})
