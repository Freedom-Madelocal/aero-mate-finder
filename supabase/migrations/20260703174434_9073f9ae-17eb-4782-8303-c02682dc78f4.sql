INSERT INTO public.feature_flags (key, label, description, enabled)
VALUES ('free_guide', 'Free guide page', 'Public /free-guide lead-magnet landing page and its nav/footer links.', true)
ON CONFLICT (key) DO NOTHING;