import { supabase } from './supabase';

export const createTestPlan = async (userId) => {
  try {
    // Create mission
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .insert([{
        user_id: userId,
        title: 'Build a thriving coaching practice'
      }])
      .select()
      .single();

    if (missionError) throw missionError;
    console.log('✓ Created mission:', mission.title);

    // Create strategies
    const strategiesData = [
      { name: 'Develop core competencies', description: 'Build expertise in coaching methodology and psychology', sort_order: 0 },
      { name: 'Build client base', description: 'Attract and retain ideal clients', sort_order: 1 },
      { name: 'Business infrastructure', description: 'Set up sustainable systems and processes', sort_order: 2 }
    ];

    const { data: strategies, error: strategiesError } = await supabase
      .from('strategies')
      .insert(strategiesData.map(s => ({ ...s, mission_id: mission.id })))
      .select();

    if (strategiesError) throw strategiesError;
    console.log(`✓ Created ${strategies.length} strategies`);

    // Create tactics for each strategy
    const tactics = [
      // Strategy 1 tactics
      { strategy_id: strategies[0].id, action: 'Complete advanced coaching certification', type: 'tickable', sort_order: 0 },
      { strategy_id: strategies[0].id, action: 'Read coaching methodology books', type: 'measurable', target_value: 5, unit: 'books', current_value: 2, sort_order: 1 },
      { strategy_id: strategies[0].id, action: 'Practice active listening daily', type: 'tickable', sort_order: 2 },

      // Strategy 2 tactics
      { strategy_id: strategies[1].id, action: 'Reach out to potential clients', type: 'measurable', target_value: 10, unit: 'outreach/week', current_value: 0, sort_order: 0 },
      { strategy_id: strategies[1].id, action: 'Complete case studies portfolio', type: 'measurable', target_value: 3, unit: 'case studies', current_value: 1, sort_order: 1 },
      { strategy_id: strategies[1].id, action: 'Request testimonials from current clients', type: 'tickable', sort_order: 2 },

      // Strategy 3 tactics
      { strategy_id: strategies[2].id, action: 'Set up scheduling system', type: 'tickable', sort_order: 0 },
      { strategy_id: strategies[2].id, action: 'Document service offerings', type: 'measurable', target_value: 4, unit: 'packages', current_value: 0, sort_order: 1 },
      { strategy_id: strategies[2].id, action: 'Create coaching agreement template', type: 'tickable', sort_order: 2 }
    ];

    const { data: createdTactics, error: tacticsError } = await supabase
      .from('tactics')
      .insert(tactics)
      .select();

    if (tacticsError) throw tacticsError;
    console.log(`✓ Created ${createdTactics.length} tactics`);

    console.log('✅ Test plan created successfully!');
    console.log('Mission ID:', mission.id);
    return mission.id;
  } catch (error) {
    console.error('❌ Error creating test plan:', error);
    throw error;
  }
};
