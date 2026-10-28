<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import ChipInput from '@/components/ChipInput.vue'
import type { BlockType, ParseDetail, ResumeBlock, ResumeSchema } from '@/types'

const route = useRoute()
const router = useRouter()

const detail = ref<ParseDetail | null>(null)
const schema = ref<ResumeSchema | null>(null)
const loading = ref(true)
const error = ref('')
const saving = ref(false)

const SECTION_TITLES: Record<BlockType, string> = {
  BASIC: '基本信息',
  EDUCATION: '教育背景',
  WORK: '实习 / 工作经历',
  PROJECT: '项目经历',
  SKILL: '专业技能',
  AWARD: '获奖荣誉',
  OTHER: '其他'
}

const resumeId = computed(() => Number(route.params.id))

const lowFields = computed(() => new Set(schema.value?.meta.lowConfidenceFields ?? []))
const lowCount = computed(() => lowFields.value.size)

const sections = computed(() => {
  if (!detail.value) return []
  const grouped = new Map<BlockType, ResumeBlock[]>()
  for (const block of detail.value.blocks) {
    const list = grouped.get(block.blockType) ?? []
    list.push(block)
    grouped.set(block.blockType, list)
  }
  return Array.from(grouped.entries()).map(([type, blocks]) => ({
    type,
    title: SECTION_TITLES[type],
    blocks
  }))
})

const skillNames = computed<string[]>({
  get: () => schema.value?.skills.map((skill) => skill.name) ?? [],
  set: (names) => {
    const current = schema.value
    if (!current) return
    current.skills = names.map((name) => {
      const existing = current.skills.find((skill) => skill.name === name)
      return existing ?? { name, raw: name, level: 'PROFICIENT' as const, source: 'USER' }
    })
  }
})

function isLow(path: string): boolean {
  return lowFields.value.has(path)
}

function confText(path: string, value?: number): string {
  if (isLow(path)) return '< 0.85'
  return typeof value === 'number' ? value.toFixed(2) : '—'
}

function confHint(path: string, fallback: string): string {
  return isLow(path) ? '低置信，请确认' : fallback
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const data = await api.getParseDetail(resumeId.value)
    detail.value = data
    schema.value = JSON.parse(JSON.stringify(data.schema)) as ResumeSchema
  } catch (err) {
    error.value = err instanceof Error ? err.message : '解析结果加载失败'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!detail.value || !schema.value) return
  saving.value = true
  try {
    const result = await api.saveResumeSchema(detail.value.versionId, schema.value)
    detail.value.versionId = result.versionId
    detail.value.versionNo = result.versionNo
    detail.value.resume.currentVersion = result.versionNo
    detail.value.resume.versionCount = result.versionNo
    detail.value.resume.status = 'CONFIRMED'
    schema.value.meta.lowConfidenceFields = []
    ElMessage.success(`已保存为 v${result.versionNo}`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function reparse(): void {
  ElMessage.info('解析任务已重新提交，完成后会覆盖本次未保存的修改')
}

onMounted(load)
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>简历解析结果</h1>
        <p class="sub">
          <template v-if="detail && schema">
            <template v-if="lowCount">
              {{ lowCount }} 个低置信字段待确认，确认后生成 v{{ detail.versionNo + 1 }} 版本
            </template>
            <template v-else>全部字段已确认，当前为 v{{ detail.versionNo }}</template>
          </template>
          <template v-else>加载中…</template>
        </p>
      </div>
      <div class="top-actions">
        <button class="btn" type="button" @click="router.push('/resumes')">返回列表</button>
        <button class="btn" type="button" @click="reparse">重新解析</button>
        <button class="btn btn-primary" :disabled="saving || !schema" type="button" @click="save">
          {{ saving ? '保存中…' : '确认并保存' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-text">正在加载解析结果…</div>
    <div v-else-if="error" class="card">
      <div class="empty">
        {{ error }}
        <div style="margin-top: 12px">
          <button class="btn" type="button" @click="load">重试</button>
        </div>
      </div>
    </div>

    <div v-else-if="detail && schema" class="grid g-1-1">
      <div class="card">
        <div class="card-h">
          <div class="card-t">原文</div>
          <span class="tiny muted">
            {{ detail.resume.fileName }} · {{ schema.meta.pageCount }} 页 ·
            {{ schema.meta.docType }}
          </span>
        </div>
        <div class="card-b">
          <div class="pdf">
            <div class="page-tag">1 / {{ schema.meta.pageCount }}</div>
            <div v-for="section in sections" :key="section.type">
              <div class="sec">{{ section.title }}</div>
              <div
                v-for="block in section.blocks"
                :key="block.id"
                class="block"
                :class="block.highlight ? ['hl', block.highlight === 'bad' ? 'bad' : ''] : []"
              >
                {{ block.rawText }}
              </div>
            </div>
          </div>
          <div class="tiny muted" style="margin-top: 10px">
            高亮段落为低置信字段对应的原文，修改右侧表单不会改变原稿，确认后写入新版本。
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h">
          <div class="card-t">结构化字段</div>
          <span v-if="lowCount" class="tag warn">{{ lowCount }} 处待确认</span>
          <span v-else class="tag ok">已全部确认</span>
        </div>
        <div class="card-b">
          <div class="section-title">基本信息</div>
          <div class="split">
            <div class="field" :class="{ low: isLow('basic.name') }">
              <label>姓名</label>
              <el-input v-model="schema.basic.name" />
              <div class="conf" :class="{ low: isLow('basic.name') }">
                <span class="pill">{{ confText('basic.name', schema.basic.confidence.name) }}</span>
                {{ confHint('basic.name', '规则命中') }}
              </div>
            </div>
            <div class="field" :class="{ low: isLow('basic.phone') }">
              <label>手机号</label>
              <el-input v-model="schema.basic.phone" />
              <div class="conf" :class="{ low: isLow('basic.phone') }">
                <span class="pill">
                  {{ confText('basic.phone', schema.basic.confidence.phone) }}
                </span>
                {{ confHint('basic.phone', '正则命中') }}
              </div>
            </div>
          </div>
          <div class="split">
            <div class="field" :class="{ low: isLow('basic.email') }">
              <label>邮箱</label>
              <el-input v-model="schema.basic.email" />
              <div class="conf" :class="{ low: isLow('basic.email') }">
                <span class="pill">{{ confText('basic.email', schema.basic.confidence.email) }}</span>
                {{ confHint('basic.email', '正则命中') }}
              </div>
            </div>
            <div class="field" :class="{ low: isLow('basic.city') }">
              <label>城市</label>
              <el-input v-model="schema.basic.city" />
              <div class="conf" :class="{ low: isLow('basic.city') }">
                <span class="pill">{{ confText('basic.city', schema.basic.confidence.city) }}</span>
                {{ confHint('basic.city', '词典命中') }}
              </div>
            </div>
          </div>
          <div class="field" :class="{ low: isLow('basic.jobIntention') }">
            <label>求职意向</label>
            <el-input v-model="schema.basic.jobIntention" />
            <div class="conf" :class="{ low: isLow('basic.jobIntention') }">
              <span class="pill">
                {{ confText('basic.jobIntention', schema.basic.confidence.jobIntention) }}
              </span>
              {{ confHint('basic.jobIntention', '版式规则') }}
            </div>
          </div>

          <div class="section-title">教育背景</div>
          <div v-for="(edu, index) in schema.education" :key="index" style="margin-bottom: 6px">
            <div class="split">
              <div class="field" :class="{ low: isLow(`education[${index}].school`) }">
                <label>学校</label>
                <el-input v-model="edu.school" />
                <div class="conf" :class="{ low: isLow(`education[${index}].school`) }">
                  <span class="pill">
                    {{ confText(`education[${index}].school`, edu.confidence) }}
                  </span>
                  {{ confHint(`education[${index}].school`, '词典命中') }}
                </div>
              </div>
              <div class="field" :class="{ low: isLow(`education[${index}].major`) }">
                <label>专业</label>
                <el-input v-model="edu.major" />
                <div class="conf" :class="{ low: isLow(`education[${index}].major`) }">
                  <span class="pill">
                    {{ confText(`education[${index}].major`, edu.confidence) }}
                  </span>
                  {{ confHint(`education[${index}].major`, '词典命中') }}
                </div>
              </div>
            </div>
            <div class="split">
              <div class="field" :class="{ low: isLow(`education[${index}].degree`) }">
                <label>学历</label>
                <el-select v-model="edu.degree" style="width: 100%">
                  <el-option label="专科" value="专科" />
                  <el-option label="本科" value="本科" />
                  <el-option label="硕士" value="硕士" />
                  <el-option label="博士" value="博士" />
                </el-select>
                <div class="conf" :class="{ low: isLow(`education[${index}].degree`) }">
                  <span class="pill">
                    {{ confText(`education[${index}].degree`, edu.confidence) }}
                  </span>
                  {{ confHint(`education[${index}].degree`, '规则命中') }}
                </div>
              </div>
              <div class="field" :class="{ low: isLow(`education[${index}].end`) }">
                <label>结束时间</label>
                <el-input v-model="edu.end" />
                <div class="conf" :class="{ low: isLow(`education[${index}].end`) }">
                  <span class="pill">{{ confText(`education[${index}].end`, edu.confidence) }}</span>
                  {{ confHint(`education[${index}].end`, '区间规则') }}
                </div>
              </div>
            </div>
          </div>

          <div class="section-title">实习 / 工作经历</div>
          <div v-for="(work, index) in schema.work" :key="index" style="margin-bottom: 6px">
            <div class="split">
              <div class="field" :class="{ low: isLow(`work[${index}].company`) }">
                <label>公司</label>
                <el-input v-model="work.company" />
              </div>
              <div class="field" :class="{ low: isLow(`work[${index}].title`) }">
                <label>岗位</label>
                <el-input v-model="work.title" />
              </div>
            </div>
            <div class="split">
              <div class="field">
                <label>开始时间</label>
                <el-input v-model="work.start" />
              </div>
              <div class="field" :class="{ low: isLow(`work[${index}].end`) }">
                <label>结束时间</label>
                <el-input v-model="work.end" />
              </div>
            </div>
            <div class="field" :class="{ low: isLow(`work[${index}].description`) }">
              <label>职责描述</label>
              <el-input v-model="work.description" type="textarea" :rows="2" />
            </div>
          </div>

          <div class="section-title">项目经历</div>
          <div v-for="(project, index) in schema.project" :key="index" style="margin-bottom: 6px">
            <div class="split">
              <div class="field" :class="{ low: isLow(`project[${index}].name`) }">
                <label>项目名称</label>
                <el-input v-model="project.name" />
              </div>
              <div class="field" :class="{ low: isLow(`project[${index}].role`) }">
                <label>项目角色</label>
                <el-input v-model="project.role" />
                <div class="conf" :class="{ low: isLow(`project[${index}].role`) }">
                  <span class="pill">
                    {{ confText(`project[${index}].role`, project.confidence) }}
                  </span>
                  {{ confHint(`project[${index}].role`, '版式规则') }}
                </div>
              </div>
            </div>
            <div class="field">
              <label>技术栈</label>
              <ChipInput v-model="project.stack" add-label="添加技术" />
            </div>
            <div class="field">
              <label>项目描述</label>
              <el-input v-model="project.description" type="textarea" :rows="2" />
            </div>
          </div>

          <div class="section-title">专业技能</div>
          <div class="field">
            <label>技能（已归一）</label>
            <ChipInput v-model="skillNames" add-label="添加" />
            <div class="conf">
              <span class="pill">{{ schema.skills.length }}</span>
              项 · 归一准确率 0.85
            </div>
          </div>

          <div class="warnbox">
            低置信字段会参与打分，但不会作为简历定稿内容。确认后写入新版本，旧版本保留可回溯。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
