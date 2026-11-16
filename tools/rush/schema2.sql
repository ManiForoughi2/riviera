CREATE TABLE IF NOT EXISTS ratings (pnm TEXT NOT NULL, brother TEXT NOT NULL, rating INTEGER DEFAULT 0, thoughts TEXT, at INTEGER, PRIMARY KEY (pnm, brother));
