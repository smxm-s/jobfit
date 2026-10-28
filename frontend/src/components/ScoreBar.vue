<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    score: number
    thin?: boolean
  }>(),
  { thin: false }
)

const percent = computed(() => Math.max(0, Math.min(1, props.score)) * 100)
const color = computed(() =>
  props.score >= 0.75 ? 'var(--ok)' : props.score >= 0.6 ? '#c9a227' : '#b9c0c8'
)
const tone = computed(() =>
  props.score >= 0.75 ? 's-hi' : props.score >= 0.6 ? 's-mid' : 's-low'
)
</script>

<template>
  <div class="score">
    <b :class="tone">{{ score.toFixed(2) }}</b>
    <div class="bar" :class="{ thin }">
      <i :style="{ width: percent + '%', background: color }"></i>
    </div>
  </div>
</template>
