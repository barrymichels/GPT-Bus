# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev        # Start development server with nodemon
npm start          # Start production server
npm test           # Run all tests with coverage
```

### Docker
```bash
docker build -t gpt-bus .
docker run -p 3000:3000 -v ./db:/usr/src/app/db -d gpt-bus
```

### Testing Single Files
```bash
npx jest test/unit/routes/riders.test.js  # Run specific test file
```

## Architecture

GPT-Bus is a bus rental management system built with Express.js following MVC pattern:

- **Routes** (`/src/routes/`): Each feature has its own router factory that accepts a database connection
- **Views** (`/views/`): Pug templates with Tailwind CSS (loaded from CDN) using dark theme
- **Database**: SQLite with tables for users, riders, trips, payments, emergency_contacts
- **Authentication**: Passport.js with persistent sessions stored in SQLite
- **Services**: Email service uses Nodemailer for payment receipts

### Key Patterns

1. **Router Factory Pattern**: All routes use `createXRouter(db)` for dependency injection
2. **Database Migrations**: SQL files in `/migrations/` are applied on startup
3. **Session Persistence**: Sessions survive server restarts using connect-sqlite3
4. **Multi-Trip Support**: Riders can be associated with multiple trips via junction table
5. **Cascade Deletes**: Database uses foreign key constraints with CASCADE for cleanup

### Testing Approach

- Uses Jest with Supertest for integration testing
- In-memory SQLite database for test isolation
- Email service is mocked in tests
- Tests organized by feature in `/test/unit/`

### Environment Configuration

Required `.env` variables (see `.env.sample`):
- `COST_PER_SEAT`: Default balance for new riders
- `EMAIL_USER`, `EMAIL_PASS`: For payment receipt emails
- `SESSION_SECRET`: For session encryption
- `DB_PATH`: Database file location (default: `./db/database.db`)

Default admin credentials: `admin` / `password123`