package com.entrevistator.dto;

public record AnswerResponse(
        boolean correct,
        String explanation
) {
}
