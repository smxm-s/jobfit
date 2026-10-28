<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import EvidenceDrawer from '@/components/EvidenceDrawer.vue'
import type { MatchReport, ReportEvidence, SkillHit } from '@/types'

interface SkillRow extends SkillHit {
  kind: 'hit' | 'partial' | 'missed'
}

const route = useRoute()
const router = useRouter()

const report = ref<MatchReport | null>(null)
const loading = ref(true)
const error = ref('')
const drawerVisible = ref(false)
const selectedEvidence = ref<ReportEvidence | null>(null)

const CIRCUMFERENCE = 2 * Math.PI * 56

const record = computed(() => report.value)

const ringOffset = computed(() => {
  const score = report.value?.totalScore ?? 0
  return CIRCUMFERENCE * (1 - score)
})

const totalPercent = computed(() => Math.round((report.value?.totalScore ?? 0) * 100))

const subLines = computed(() => {
  if (!report.value) return []
  const weights = report.value.weights
  const scores = report.value.subScores
  return [
    { label: `技能 ${Math.round(weights.skill * 100)}%`, value: scores.skill },
    { label: `语义 ${Math.round(weights.sem * 100)}%`, value: scores.sem },
    { label: `经历 ${Math.round(weights.exp * 100)}%`, value: scores.exp },
    { label: `教育 ${Math.round(weights.edu * 100)}%`, value: scores.edu }
  ]
})

const skillRows = computed<SkillRow[]>(() => {
  if (!report.value) return []
  return [
    ...report.value.skills.hit.map((skill) => ({ ...skill, kind: 'hit' as const })),
    ...report.value.skills.partial.map((skill) => ({ ...skill, kind: 'partial' as const })),
    ...report.value.skills.missed.map((skill) => ({ ...skill, kind: 'missed' as const }))
  ]
})

const hardCount = computed(() => {
  if (!report.value) return 0
  return (
    report.value.skills.hit.length +
    report.value.skills.partial.length +
    report.value.skills.missed.length
  )
})

const LEVEL_TEXT: Record<string, string> = {
  BASIC: '了解',
  PROFICIENT: '熟练',
  EXPERT: '精通'
}

const KIND_META: Record<SkillRow['kind'], { text: string; tone: string; row: string }> = {
  hit: { text: '命中', tone: 'ok', row: '' },
  partial: { text: '部分', tone: 'warn', row: 'part' },
  missed: { text: '缺失', tone: 'bad', row: 'miss' }
}

function levelText(level?: string): string {
  return (level && LEVEL_TEXT[level]) || ''
}

function subText(row: SkillRow): string {
  if (row.kind === 'partial') return row.note || '部分命中'
  if (row.kind === 'missed') return row.reqType === 'HARD' ? '硬性要求' : '加分项'
  return levelText(row.level)
}

function openEvidence(row: SkillRow): void {
  const evidence = report.value?.evidences[row.skill]
  if (!evidence) {
    ElMessage.info('该技能暂无证据快照')
    return
  }
  selectedEvidence.value = evidence
  drawerVisible.value = true
}

function closeEvidence(): void {
  drawerVisible.value = false
}

function enqueue(): void {
  ElMessage.success('已标记为待投递')
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    report.value = await api.getReport(Number(route.params.id))
  } catch (err) {
    error.value = err instanceof Error ? err.message : '报告加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>{{ report?.job.title || '诊断报告' }}</h1>
        <p class="sub">
          <template v-if="report">
            {{ report.job.company }} · {{ report.job.city }} · {{ report.job.salary }} ·
            {{ report.job.exp }} · {{ report.job.degree }}
          </template>
          <template v-else>加载中…</template>
        </p>
      </div>
      <div class="top-actions">
        <button class="btn" type="button" @click="router.push('/jobs')">返回列表</button>
        <button class="btn btn-primary" :disabled="!report" type="button" @click="enqueue">
          加入投递队列
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-text">正在加载诊断报告…</div>
    <div v-else-if="error" class="card">
      <div class="empty">
        {{ error }}
        <div style="margin-top: 12px">
          <button class="btn" type="button" @click="load">重试</button>
        </div>
      </div>
    </div>

    <template v-else-if="record">
      <div class="card" style="margin-bottom: 14px">
        <div class="report-head">
          <div class="donut">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle cx="66" cy="66" r="56" fill="none" stroke="#eef0f3" stroke-width="12"></circle>
              <circle
                cx="66"
                cy="66"
                r="56"
                fill="none"
                stroke="#0f766e"
                stroke-width="12"
                stroke-linecap="round"
                :stroke-dasharray="CIRCUMFERENCE"
                :stroke-dashoffset="ringOffset"
              ></circle>
            </svg>
            <div class="center">
              <b>{{ totalPercent }}</b>
              <span>总分 / 100</span>
            </div>
          </div>

          <div class="subscore">
            <div v-for="line in subLines" :key="line.label" class="line">
              <span>{{ line.label }}</span>
              <div class="bar"><i :style="{ width: line.value * 100 + '%' }"></i></div>
              <b>{{ line.value.toFixed(2) }}</b>
            </div>
          </div>

          <div class="snapshot">
            <div class="tiny muted" style="margin-bottom: 6px">算法快照</div>
            <div class="kv" style="padding: 5px 0">
              <span>算法版本</span><b class="mono">{{ record.algoVersion }}</b>
            </div>
            <div class="kv" style="padding: 5px 0">
              <span>简历版本</span><b>{{ record.resumeVersion }}</b>
            </div>
            <div class="kv" style="padding: 5px 0">
              <span>词典版本</span><b class="mono">{{ record.dictVersion }}</b>
            </div>
            <div class="kv" style="padding: 5px 0">
              <span>可复算</span>
              <b><span class="tag ok">是</span></b>
            </div>
          </div>
        </div>
      </div>

      <div class="grid g-2-1">
        <div class="stack">
          <div class="card">
            <div class="card-h">
              <div class="card-t">技能命中</div>
              <span class="tiny muted">硬性要求 {{ hardCount }} 项</span>
            </div>
            <div class="card-b">
              <div class="skill-grid">
                <div
                  v-for="row in skillRows"
                  :key="row.kind + row.skill"
                  class="skill"
                  :class="KIND_META[row.kind].row"
                >
                  <span class="tag" :class="KIND_META[row.kind].tone">
                    {{ KIND_META[row.kind].text }}
                  </span>
                  <span class="nm">{{ row.skill }}</span>
                  <span class="tiny muted">{{ subText(row) }}</span>
                  <span class="ev" @click="openEvidence(row)">查看证据 →</span>
                </div>
              </div>
              <div v-if="!skillRows.length" class="empty small">该报告暂无技能明细</div>
            </div>
          </div>

          <div class="card">
            <div class="card-h">
              <div class="card-t">风险提示</div>
              <span class="tag warn">{{ record.risks.length }} 条</span>
            </div>
            <div class="card-b">
              <div v-for="(risk, index) in record.risks" :key="index" class="risk">
                <i></i>
                <div>{{ risk }}</div>
              </div>
              <div v-if="!record.risks.length" class="empty small">暂无风险提示</div>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-h"><div class="card-t">分项说明</div></div>
            <div class="card-b">
              <div class="kv">
                <span>技能加权覆盖率</span><b>{{ record.details.skillCoverage }}</b>
              </div>
              <div class="kv">
                <span>语义最高匹配块</span><b>{{ record.details.bestSemanticBlock }}</b>
              </div>
              <div class="kv">
                <span>经历时间重叠</span><b>{{ record.details.expOverlap }}</b>
              </div>
              <div class="kv">
                <span>学历判定</span><b>{{ record.details.eduVerdict }}</b>
              </div>
              <div class="kv">
                <span>权重配置</span>
                <b class="mono">
                  {{ record.weights.skill }} / {{ record.weights.sem }} /
                  {{ record.weights.exp }} / {{ record.weights.edu }}
                </b>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-h">
              <div class="card-t">岗位要求</div>
              <span class="tiny muted">来自 JD 详情页</span>
            </div>
            <div class="card-b" style="display: grid; gap: 8px">
              <div v-for="(item, index) in record.requirements" :key="index" class="quote">
                {{ item }}
              </div>
              <div class="tiny muted">JD 全文不入库，只保留逐条要求与哈希。</div>
            </div>
          </div>
        </div>
      </div>

      <EvidenceDrawer
        :visible="drawerVisible"
        :evidence="selectedEvidence"
        @close="closeEvidence"
      />
    </template>
  </div>
</template>
