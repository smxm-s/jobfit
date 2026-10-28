package com.jobfit.match;

import com.fasterxml.jackson.databind.JsonNode;
import com.jobfit.job.entity.Job;
import com.jobfit.match.dto.BatchMatchItem;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 算法服务不可用时的本地兜底打分：
 * score = 0.7 × 技能覆盖率 + 0.3 × 学历分。
 */
public final class LocalMatcher {

    private static final Pattern ASCII_TOKEN = Pattern.compile("[A-Za-z][A-Za-z0-9+#.\\-]{1,20}");

    public static BatchMatchItem score(JsonNode schema, Job job) {
        Set<String> resumeSkills = resumeSkills(schema);
        List<String> required = requiredSkills(job);

        List<String> hitSkills = new ArrayList<>();
        List<String> missSkills = new ArrayList<>();
        for (String skill : required) {
            if (matched(skill, resumeSkills)) {
                hitSkills.add(skill);
            } else {
                missSkills.add(skill);
            }
        }

        double skillScore = required.isEmpty() ? 0.6 : (double) hitSkills.size() / required.size();
        double eduScore = eduScore(schema, job.getDegreeReq());
        double total = 0.7 * skillScore + 0.3 * eduScore;

        BatchMatchItem item = new BatchMatchItem();
        item.setJobId(job.getId());
        item.setScore(BigDecimal.valueOf(total).setScale(4, RoundingMode.HALF_UP));
        item.setStage("COARSE");
        item.setHitSkills(hitSkills);
        item.setMissSkills(missSkills);
        item.setFallback(true);
        return item;
    }

    private static Set<String> resumeSkills(JsonNode schema) {
        Set<String> skills = new LinkedHashSet<>();
        JsonNode skillNodes = schema.path("skills");
        if (skillNodes.isArray()) {
            for (JsonNode node : skillNodes) {
                addSkill(skills, node.path("name").asText(null));
            }
        }
        JsonNode projects = schema.path("project");
        if (projects.isArray()) {
            for (JsonNode project : projects) {
                JsonNode stack = project.path("stack");
                if (stack.isArray()) {
                    for (JsonNode item : stack) {
                        addSkill(skills, item.asText(null));
                    }
                }
            }
        }
        return skills;
    }

    private static void addSkill(Set<String> skills, String raw) {
        if (raw != null && !raw.isBlank()) {
            skills.add(raw.trim().toLowerCase(Locale.ROOT));
        }
    }

    private static List<String> requiredSkills(Job job) {
        List<String> result = new ArrayList<>();
        if (job.getTags() != null && !job.getTags().isBlank()) {
            for (String tag : job.getTags().split("[,，]")) {
                if (!tag.isBlank() && result.size() < 20) {
                    result.add(tag.trim());
                }
            }
        }
        if (result.isEmpty()) {
            String text = (job.getTitle() == null ? "" : job.getTitle()) + " "
                    + (job.getJdSummary() == null ? "" : job.getJdSummary());
            Matcher matcher = ASCII_TOKEN.matcher(text);
            while (matcher.find() && result.size() < 20) {
                String token = matcher.group();
                if (!result.contains(token)) {
                    result.add(token);
                }
            }
        }
        return result;
    }

    private static boolean matched(String requirement, Set<String> resumeSkills) {
        String req = requirement.toLowerCase(Locale.ROOT).trim();
        for (String skill : resumeSkills) {
            if (skill.equals(req) || skill.contains(req) || req.contains(skill)) {
                return true;
            }
        }
        return false;
    }

    private static double eduScore(JsonNode schema, String degreeRequirement) {
        if (degreeRequirement == null || degreeRequirement.isBlank()
                || degreeRequirement.contains("不限")) {
            return 0.8;
        }
        int required = degreeRank(degreeRequirement);
        if (required == 0) {
            return 0.8;
        }
        int highest = 0;
        JsonNode educations = schema.path("education");
        if (educations.isArray()) {
            for (JsonNode node : educations) {
                highest = Math.max(highest, degreeRank(node.path("degree").asText("")));
            }
        }
        if (highest == 0) {
            return 0.5;
        }
        int diff = highest - required;
        if (diff >= 0) {
            return 1.0;
        }
        return diff == -1 ? 0.4 : 0.1;
    }

    private static int degreeRank(String text) {
        if (text == null) {
            return 0;
        }
        if (text.contains("博士")) {
            return 4;
        }
        if (text.contains("硕士") || text.contains("研究生")) {
            return 3;
        }
        if (text.contains("本科")) {
            return 2;
        }
        if (text.contains("大专") || text.contains("专科")) {
            return 1;
        }
        return 0;
    }

    private LocalMatcher() {
    }
}
