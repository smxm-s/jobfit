import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { tokenStorage } from '@/api/http'
import type { UserInfo } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(tokenStorage.get())
  const user = ref<UserInfo | null>(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => Boolean(token.value))

  async function login(username: string, password: string): Promise<void> {
    loading.value = true
    try {
      const result = await api.login({ username, password })
      token.value = result.token
      tokenStorage.set(result.token)
      user.value = result.user
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, password: string, nickname: string): Promise<void> {
    loading.value = true
    try {
      const result = await api.register({ username, password, nickname })
      token.value = result.token
      tokenStorage.set(result.token)
      user.value = result.user
    } finally {
      loading.value = false
    }
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    user.value = await api.getMe()
  }

  function logout(): void {
    tokenStorage.clear()
    token.value = ''
    user.value = null
  }

  return { token, user, loading, isLoggedIn, login, register, fetchMe, logout }
})
