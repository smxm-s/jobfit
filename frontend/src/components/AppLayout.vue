<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const workspace = useWorkspaceStore()

const nav = [
  { label: '工作台', to: '/' },
  { label: '简历', to: '/resumes' },
  { label: '岗位筛选', to: '/agent' },
  { label: '已采集岗位', to: '/jobs' }
]

const manageNav = [{ label: '投递记录', to: '/applications' }]

const stats = computed(() => workspace.dashboard?.stats ?? null)
const plugin = computed(() => workspace.dashboard?.plugin ?? null)

const avatarText = computed(() => {
  const name = auth.user?.nickname || auth.user?.username || 'J'
  return name.slice(0, 1)
})

function isActive(path: string): boolean {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

async function logout(): Promise<void> {
  auth.logout()
  await router.push('/login')
}

onMounted(() => {
  if (!auth.user) {
    void auth.fetchMe().catch(() => undefined)
  }
  void workspace.load()
})
</script>

<template>
  <div class="app">
    <aside class="side">
      <div class="brand">
        <div class="brand-mark">J</div>
        <div>
          <div class="brand-name">JobFit</div>
          <div class="brand-sub">求职匹配工作台</div>
        </div>
      </div>

      <div class="nav-label">求职</div>
      <router-link
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
      >
        <span class="dot"></span>
        {{ item.label }}
        <span v-if="item.to === '/resumes' && stats" class="nav-badge">
          v{{ stats.resumeVersions }}
        </span>
        <span v-else-if="item.to === '/jobs' && stats" class="nav-badge">
          {{ stats.totalJobs }}
        </span>
      </router-link>

      <div class="nav-label">管理</div>
      <router-link
        v-for="item in manageNav"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
      >
        <span class="dot"></span>
        {{ item.label }}
      </router-link>

      <div class="side-foot">
        <div class="side-user">
          <div class="avatar">{{ avatarText }}</div>
          <div>
            <div style="color: #e8ecf1; font-size: 12.5px">
              {{ auth.user?.nickname || auth.user?.username || '未登录' }}
            </div>
            <small>{{ auth.user?.intention || '—' }}</small>
          </div>
        </div>
        <div class="side-foot-line">
          <span>
            <template v-if="plugin">
              {{ plugin.connected ? '插件已连接' : '插件未连接' }} · 今日剩余
              {{ stats?.remainingQuota ?? 0 }} 次
            </template>
            <template v-else>插件状态加载中…</template>
          </span>
          <button class="link-btn" type="button" @click="logout">退出</button>
        </div>
      </div>
    </aside>

    <main class="main">
      <router-view />
    </main>
  </div>
</template>
