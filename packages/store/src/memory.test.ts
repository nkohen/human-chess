import { defineGamesStoreTests } from './gamesStore.contract';
import { createMemoryGamesStore } from './memory';

defineGamesStoreTests('memory', () => createMemoryGamesStore());
