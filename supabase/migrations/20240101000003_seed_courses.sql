-- Seed initial courses
INSERT INTO breadmaker.courses (id, title, category, description, image_url, total_lessons, total_hours, likes, badges)
VALUES
  (
    'c1',
    'Breadmaker Systems Primer',
    'Operations',
    'Interactive lesson: Are you ready?',
    'https://images.unsplash.com/photo-1516280440502-86928e83f3da?auto=format&fit=crop&q=80&w=600',
    52,
    9,
    128,
    '[{"type": "top", "text": "TOP"}, {"type": "info", "icon": "discussion", "text": "Discussion"}]'::jsonb
  ),
  (
    'c2',
    'Ops Director Mastery',
    'Management',
    'How to deploy automated workflows',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600',
    48,
    7,
    110,
    '[{"type": "top", "text": "TOP"}, {"type": "info", "icon": "discussion", "text": "Discussion"}]'::jsonb
  ),
  (
    'c3',
    'CMO Agent Tuning',
    'Marketing',
    'Using logic branches for seamless campaigns',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=600',
    9,
    4,
    15,
    '[{"type": "top", "text": "TOP"}, {"type": "info", "icon": "tech", "text": "Tech"}]'::jsonb
  ),
  (
    'c4',
    'David Guetta vs Kaskade',
    'How to mix like pro DJs',
    'Here''s an easy way to remix any mainstage drop!',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=600',
    1,
    0.5,
    22,
    '[]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
