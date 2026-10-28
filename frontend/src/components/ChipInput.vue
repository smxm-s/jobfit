<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    addLabel?: string
    placeholder?: string
  }>(),
  { addLabel: '添加', placeholder: '输入后回车' }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void
}>()

const editing = ref(false)
const draft = ref('')

function add(): void {
  const value = draft.value.trim()
  if (value && !props.modelValue.includes(value)) {
    emit('update:modelValue', [...props.modelValue, value])
  }
  draft.value = ''
  editing.value = false
}

function remove(index: number): void {
  const next = [...props.modelValue]
  next.splice(index, 1)
  emit('update:modelValue', next)
}

function cancelIfEmpty(): void {
  if (!draft.value.trim()) {
    editing.value = false
  }
}
</script>

<template>
  <div class="chips">
    <span v-for="(item, index) in modelValue" :key="item" class="chip">
      <b>{{ item }}</b>
      <button type="button" aria-label="移除" @click="remove(index)">×</button>
    </span>
    <div v-if="editing" class="chip-input">
      <el-input
        v-model="draft"
        size="small"
        :placeholder="placeholder"
        @keyup.enter="add"
        @blur="cancelIfEmpty"
      />
      <button type="button" class="btn btn-sm" @click="add">添加</button>
    </div>
    <span v-else class="chip add" @click="editing = true">+ {{ addLabel }}</span>
  </div>
</template>
