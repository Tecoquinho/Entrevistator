package com.entrevistator.dto;

public record QuestionImportResponseDTO(
        int importedCount,
        int updatedCount,
        int ignoredCount,
        int totalQuestions
) {
}
