import { decisions, reflections, strategicAlignments } from './supabase';

// Manages syncing data between localStorage and Supabase
export const dataSyncManager = {
  // Load user's data from Supabase on login
  async loadUserData(userId) {
    try {
      const [userDecisions, userReflections, userAlignments] = await Promise.all([
        decisions.getUserDecisions(userId),
        reflections.getUserReflections(userId),
        strategicAlignments.getUserAlignments(userId),
      ]);

      return {
        decisions: userDecisions || [],
        reflections: userReflections || [],
        alignments: userAlignments || [],
      };
    } catch (error) {
      console.error('Error loading user data:', error);
      return { decisions: [], reflections: [], alignments: [] };
    }
  },

  // Save decision to Supabase
  async saveDecision(userId, toolType, formData, title = null) {
    try {
      const decision = await decisions.saveDecision(userId, toolType, formData, title);
      // Clear localStorage auto-save after successful save
      this.clearAutoSave(toolType);
      return decision;
    } catch (error) {
      console.error('Error saving decision:', error);
      throw error;
    }
  },

  // Save reflection to Supabase
  async saveReflection(userId, content, title = null, linkedDecisionId = null) {
    try {
      const reflection = await reflections.saveReflection(userId, content, title, linkedDecisionId);
      // Clear localStorage auto-save after successful save
      this.clearAutoSave('journal');
      return reflection;
    } catch (error) {
      console.error('Error saving reflection:', error);
      throw error;
    }
  },

  // Save strategic alignment to Supabase
  async saveAlignment(userId, formData, title = null) {
    try {
      const alignment = await strategicAlignments.saveAlignment(userId, formData, title);
      // Clear localStorage auto-save after successful save
      this.clearAutoSave('strategic-alignment');
      return alignment;
    } catch (error) {
      console.error('Error saving alignment:', error);
      throw error;
    }
  },

  // Clear auto-save from localStorage for a specific tool
  clearAutoSave(toolType) {
    const keys = [
      `${toolType}-autosave`,
      `${toolType}-progress`,
      `${toolType}-draft`,
    ];
    keys.forEach(key => localStorage.removeItem(key));
  },

  // Get the most recent auto-saved data for a tool
  getLocalAutoSave(toolType) {
    const autoSaveKey = `${toolType}-autosave`;
    const progressKey = `${toolType}-progress`;

    try {
      // Check autosave first (most recent)
      const autoSave = localStorage.getItem(autoSaveKey);
      if (autoSave) return JSON.parse(autoSave);

      // Fall back to progress save
      const progress = localStorage.getItem(progressKey);
      if (progress) return JSON.parse(progress);

      return null;
    } catch {
      return null;
    }
  },

  // Sync local auto-save to Supabase (for background sync)
  async syncLocalToServer(userId, toolType, formData) {
    try {
      if (toolType === 'grow' || toolType === 'inversion') {
        await decisions.saveDecision(userId, toolType, formData);
      } else if (toolType === 'journal') {
        const content = formData.content || formData.text || '';
        await reflections.saveReflection(userId, content);
      } else if (toolType === 'strategic-alignment') {
        await strategicAlignments.saveAlignment(userId, formData);
      }
    } catch (error) {
      console.error(`Error syncing ${toolType} to server:`, error);
      // Don't throw - let it fail gracefully and retry on next save
    }
  },

  // Check if user has any data
  async hasUserData(userId) {
    try {
      const data = await this.loadUserData(userId);
      return (
        data.decisions.length > 0 ||
        data.reflections.length > 0 ||
        data.alignments.length > 0
      );
    } catch {
      return false;
    }
  },
};
