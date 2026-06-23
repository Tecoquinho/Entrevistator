package com.entrevistator.controller;

import com.entrevistator.dto.ProgressAnalyticsDTO;
import com.entrevistator.dto.TopicAnalyticsDTO;
import com.entrevistator.service.QuizService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class AnalyticsController {

    private final QuizService quizService;

    public AnalyticsController(QuizService quizService) {
        this.quizService = quizService;
    }

    @GetMapping("/analytics/topics")
    public List<TopicAnalyticsDTO> getTopicAnalytics() {
        return quizService.getTopicAnalytics();
    }

    @GetMapping("/analytics/gaps")
    public List<TopicAnalyticsDTO> getTopicGaps() {
        return quizService.getTopicGaps();
    }

    @GetMapping("/analytics/progress")
    public List<ProgressAnalyticsDTO> getProgressAnalytics() {
        return quizService.getProgressAnalytics();
    }
}
