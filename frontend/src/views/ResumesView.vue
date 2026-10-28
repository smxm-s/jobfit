<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import type { Resume } from '@/types'

const router = useRouter()

const resumes = ref<Resume[]>([])
const loading = ref(true)
const error = ref('')

const STATUS_TEXT: Record<Resume['status'], string> = {
  DRAFT: '草稿',
  PARSED: '待确认',
  CONFIRMED: '已确认'
}

const STATUS_TONE: Record<Resume['status'], string> = {
  DRAFT: 'line',
  PARSED: 'warn',
  CONFIRMED: 'ok'
}

const totalVersions = computed(() =>
  resumes.value.reduce((sum, resume) => sum + resume.versionCount, 0)
)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    resumes.value = await api.listResumes()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '简历列表加载失败'
  } finally {
    loading.value = false
  }
}

function statusText(status: string): string {
  return STATUS_TEXT[status as Resume['status']] ?? status
}

function statusTone(status: string): string {
  return STATUS_TONE[status as Resume['status']] ?? ''
}

function openParse(resume: Resume): void {
  void router.push(`/resumes/${resume.id}/parse`)
}

function upload(): void {
  ElMessage.info('上传入口待后端接入，当前可查看示例简历的解析校正页')
}

onMounted(load)
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>简历</h1>
        <p class="sub">
          共 {{ resumes.length }} 份简历 · {{ totalVersions }} 个版本，校正会生成新版本并保留旧版可回溯
        </p>
      </div>
      <div class="top-actions">
        <button class="btn btn-primary" type="button" @click="upload">上传简历</button>
      </div>
    </div>

    <div class="card">
      <div class="card-h">
        <div class="card-t">我的简历</div>
        <span class="tiny muted">版本不可原地修改</span>
      </div>

      <div v-if="loading" class="loading-text">正在加载简历…</div>
      <div v-else-if="error" class="empty">
        {{ error }}
        <div style="margin-top: 12px">
          <button class="btn" type="button" @click="load">重试</button>
        </div>
      </div>
      <el-table v-else :data="resumes" style="width: 100%" @row-click="openParse">
        <el-table-column label="简历" min-width="190">
          <template #default="{ row }">
            <div class="jobtitle">{{ row.title }}</div>
            <div class="jobsub">{{ row.fileName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="当前版本" width="92">
          <template #default="{ row }">
            <b>v{{ row.currentVersion }}</b>
            <span class="tiny muted"> · 共 {{ row.versionCount }} 版</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="84">
          <template #default="{ row }">
            <span class="tag" :class="statusTone(row.status)">
              {{ statusText(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="解析置信度" width="112">
          <template #default="{ row }">
            <div class="score">
              <b :class="row.confidence >= 0.85 ? 's-hi' : 's-mid'">
                {{ row.confidence.toFixed(2) }}
              </b>
              <div class="bar thin">
                <i
                  :style="{
                    width: row.confidence * 100 + '%',
                    background: row.confidence >= 0.85 ? 'var(--ok)' : '#c9a227'
                  }"
                ></i>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="126">
          <template #default="{ row }">
            <span class="muted tiny">{{ row.updatedAt }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="112" align="right">
          <template #default="{ row }">
            <button class="btn btn-sm" type="button" @click.stop="openParse(row)">
              解析校正 →
            </button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty">还没有简历，上传 PDF / DOCX 后开始解析</div>
        </template>
      </el-table>
    </div>
  </div>
</template>
