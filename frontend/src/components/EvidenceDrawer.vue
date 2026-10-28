<script setup lang="ts">
import type { ReportEvidence } from '@/types'

defineProps<{
  visible: boolean
  evidence: ReportEvidence | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()
</script>

<template>
  <div class="mask" :class="{ on: visible }" @click="emit('close')"></div>
  <aside class="drawer" :class="{ on: visible }">
    <div class="drawer-h">
      <div>
        <div class="card-t">{{ evidence ? evidence.title : '证据' }}</div>
        <div class="tiny muted">JD 原句 ↔ 简历原文</div>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" @click="emit('close')">关闭</button>
    </div>
    <div v-if="evidence" class="drawer-b">
      <div>
        <div class="tiny muted" style="margin-bottom: 5px">岗位要求原句</div>
        <div class="quote">{{ evidence.req }}</div>
      </div>
      <div>
        <div class="tiny muted" style="margin-bottom: 5px">简历证据</div>
        <template v-if="evidence.blocks.length">
          <div v-for="(block, index) in evidence.blocks" :key="index" style="margin-bottom: 8px">
            <div class="tiny muted" style="margin-bottom: 5px">
              简历第 {{ block.page }} 页 · 置信度 {{ block.confidence.toFixed(2) }}
            </div>
            <div class="quote resume">{{ block.text }}</div>
          </div>
        </template>
        <div v-else class="quote resume">简历中未找到对应描述</div>
      </div>
      <div class="warnbox">{{ evidence.note }}</div>
    </div>
  </aside>
</template>
