<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { isMockMode } from '@/api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const error = ref('')
const form = reactive({ username: '', password: '', nickname: '' })

function switchMode(next: 'login' | 'register'): void {
  mode.value = next
  error.value = ''
}

async function submit(): Promise<void> {
  error.value = ''
  if (!form.username.trim() || !form.password) {
    error.value = '请输入账号和密码'
    return
  }

  try {
    if (mode.value === 'login') {
      await auth.login(form.username.trim(), form.password)
    } else {
      await auth.register(form.username.trim(), form.password, form.nickname.trim())
    }
    ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失败，请稍后重试'
  }
}
</script>

<template>
  <div class="login">
    <aside class="login-aside">
      <div>
        <div class="brand">
          <div class="brand-mark">J</div>
          <div>
            <div class="brand-name">JobFit</div>
            <div class="brand-sub">求职匹配工作台</div>
          </div>
        </div>

        <div style="margin-top: 46px">
          <h2>把简历变成可对比、<br />可解释的能力画像</h2>
          <p>
            配好筛选条件，插件在你的登录态下采集岗位并回传打分，只保留真正值得投的机会。
          </p>
          <div class="login-points">
            <div><i></i><span>四维评分 + 证据定位，每个结论都能指回原文</span></div>
            <div><i></i><span>报告保存算法版本与输入快照，可完全复算</span></div>
            <div><i></i><span>Boss 登录态不出本机，服务端只接收岗位摘要</span></div>
          </div>
        </div>
      </div>
      <div class="login-foot">JobFit · 智能求职辅助平台 · MVP</div>
    </aside>

    <main class="login-main">
      <div class="login-card">
        <h1>{{ mode === 'login' ? '登录' : '创建账号' }}</h1>
        <p class="sub">
          {{ mode === 'login' ? '继续你的求职匹配工作台' : '注册后即可上传简历并配置筛选' }}
        </p>

        <div class="login-tabs">
          <button type="button" :class="{ on: mode === 'login' }" @click="switchMode('login')">
            登录
          </button>
          <button type="button" :class="{ on: mode === 'register' }" @click="switchMode('register')">
            注册
          </button>
        </div>

        <div class="field">
          <label>账号</label>
          <el-input v-model="form.username" placeholder="用户名" autocomplete="username" />
        </div>

        <div v-if="mode === 'register'" class="field">
          <label>昵称</label>
          <el-input v-model="form.nickname" placeholder="展示在侧边栏的昵称" />
        </div>

        <div class="field">
          <label>密码</label>
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="密码"
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>

        <button class="btn btn-primary" style="width: 100%" :disabled="auth.loading" @click="submit">
          {{ auth.loading ? '处理中…' : mode === 'login' ? '登录' : '注册并登录' }}
        </button>

        <div v-if="isMockMode" class="login-hint">
          当前为 Mock 演示模式：任意账号密码均可登录，数据与高保真视觉稿一致；关闭 mock
          后请求会带上 Bearer token 走真实 /api。
        </div>
      </div>
    </main>
  </div>
</template>
