-- Keep the database allow-list aligned with every theme exposed by the UI.

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_theme_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_theme_check CHECK (
    theme IN (
      'midnight',
      'aurora',
      'dusk',
      'light',
      'white-gold',
      'black-gold',
      'black-red',
      'pastel-light',
      'pastel-rose',
      'pastel-mint',
      'pastel-sky',
      'pastel-peach',
      'pastel-dark'
    )
  );
