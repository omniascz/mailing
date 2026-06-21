/**
 * Smart/Dependent form conditional logic (#341).
 *
 * Evaluates FormField visibility rules against submitted form data to
 * determine which fields are visible (and should be processed/required)
 * at submission time.
 */

import type { FormField, FormFieldVisibilityRule } from '../../db/schema/index.js';

/**
 * Evaluates a single visibility rule against the submitted data.
 */
function evaluateRule(rule: FormFieldVisibilityRule, data: Record<string, string>): boolean {
  const value = data[rule.dependsOn] ?? '';

  switch (rule.operator) {
    case 'equals':
      return value === (rule.value ?? '');
    case 'not_equals':
      return value !== (rule.value ?? '');
    case 'contains':
      return value.includes(rule.value ?? '');
    case 'not_contains':
      return !value.includes(rule.value ?? '');
    case 'is_empty':
      return value.trim() === '';
    case 'is_not_empty':
      return value.trim() !== '';
    default:
      return true;
  }
}

/**
 * Determines if a field is visible given the current form submission data.
 * Fields with no visibility rules are always visible.
 */
export function isFieldVisible(field: FormField, data: Record<string, string>): boolean {
  if (!field.visibilityRules || field.visibilityRules.length === 0) return true;

  const logic = field.visibilityLogic ?? 'and';
  const results = field.visibilityRules.map((rule) => evaluateRule(rule, data));

  return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Filters submitted form data to only include fields that are visible.
 * Hidden fields are stripped from the result — they should not be stored
 * or used to drive contact updates.
 */
export function filterVisibleFields(
  fields: FormField[],
  submittedData: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    if (isFieldVisible(field, submittedData) && field.name in submittedData) {
      result[field.name] = submittedData[field.name]!;
    }
  }
  return result;
}

/**
 * Validates that all visible required fields have values in submitted data.
 * Returns an array of field names that are required but empty.
 */
export function validateRequiredFields(
  fields: FormField[],
  submittedData: Record<string, string>,
): string[] {
  const missing: string[] = [];
  for (const field of fields) {
    if (!isFieldVisible(field, submittedData)) continue;
    if (field.required && !submittedData[field.name]?.trim()) {
      missing.push(field.name);
    }
  }
  return missing;
}

/**
 * Computes which fields are visible for a given data snapshot.
 * Used by the form preview endpoint to send back field state to the frontend.
 */
export function computeFieldVisibility(
  fields: FormField[],
  data: Record<string, string>,
): Array<{ name: string; visible: boolean }> {
  return fields.map((f) => ({ name: f.name, visible: isFieldVisible(f, data) }));
}
