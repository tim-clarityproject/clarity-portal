/**
 * Merge form data with existing saved data
 * New values win, but undefined/null values never erase existing data
 * Empty strings and empty arrays ARE saved (user can intentionally clear fields)
 *
 * @param {Object} existingFormData - The saved form_data from the database
 * @param {Object} newFormData - New values from the current step/form
 * @returns {Object} Merged result where new values override existing, except undefined/null
 */
export function mergeFormData(existingFormData = {}, newFormData = {}) {
  const merged = { ...existingFormData };

  Object.entries(newFormData).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  });

  return merged;
}
