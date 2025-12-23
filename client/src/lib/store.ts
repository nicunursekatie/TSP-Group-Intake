import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IntakeRecord, Task, User, MOCK_USERS, IntakeStatus } from './types';
import { addDays, subDays, parseISO, isBefore } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  currentUser: User | null;
  users: User[];
  intakeRecords: IntakeRecord[];
  tasks: Task[];
  
  // Actions
  login: (email: string) => boolean;
  logout: () => void;
  
  addIntake: (intake: Omit<IntakeRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastEditedBy'>) => string;
  updateIntake: (id: string, updates: Partial<IntakeRecord>) => void;
  deleteIntake: (id: string) => void;
  
  toggleTask: (id: string) => void;
  regenerateTasks: (intakeId: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: MOCK_USERS,
      intakeRecords: [],
      tasks: [],

      login: (email) => {
        const user = get().users.find(u => u.email === email);
        if (user) {
          set({ currentUser: user });
          return true;
        }
        return false;
      },

      logout: () => set({ currentUser: null }),

      addIntake: (intakeData) => {
        const id = uuidv4();
        const now = new Date().toISOString();
        const currentUser = get().currentUser;

        const newIntake: IntakeRecord = {
          ...intakeData,
          id,
          createdAt: now,
          updatedAt: now,
          lastEditedBy: currentUser?.id || 'system',
        };

        set(state => ({
          intakeRecords: [newIntake, ...state.intakeRecords]
        }));
        
        get().regenerateTasks(id);
        
        return id;
      },

      updateIntake: (id, updates) => {
        const now = new Date().toISOString();
        const currentUser = get().currentUser;
        
        set(state => ({
          intakeRecords: state.intakeRecords.map(record => {
            if (record.id === id) {
              const updatedRecord = { 
                ...record, 
                ...updates, 
                updatedAt: now,
                lastEditedBy: currentUser?.id || 'system'
              };
              
              // Recalculate flags
              const flags: string[] = [];
              if (!updatedRecord.hasIndoorSpace) flags.push('No Indoor Space');
              if (updatedRecord.requiresRefrigeration && !updatedRecord.hasRefrigeration) flags.push('Fridge Risk');
              if (updatedRecord.sandwichCount >= 400) flags.push('High Volume (Rep Req)');
              // Add more logic as needed
              updatedRecord.flags = flags;
              
              return updatedRecord;
            }
            return record;
          })
        }));

        // Regenerate tasks if event date changed
        if (updates.eventDate) {
            get().regenerateTasks(id);
        }
      },

      deleteIntake: (id) => {
        set(state => ({
          intakeRecords: state.intakeRecords.filter(r => r.id !== id),
          tasks: state.tasks.filter(t => t.intakeId !== id)
        }));
      },

      toggleTask: (id) => {
        set(state => ({
          tasks: state.tasks.map(t => 
            t.id === id 
              ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined } 
              : t
          )
        }));
      },

      regenerateTasks: (intakeId) => {
        const record = get().intakeRecords.find(r => r.id === intakeId);
        if (!record || !record.eventDate) return;

        const eventDate = parseISO(record.eventDate);
        const createdDate = parseISO(record.createdAt);
        
        // Clear existing tasks for this record
        set(state => ({
            tasks: state.tasks.filter(t => t.intakeId !== intakeId)
        }));

        const newTasks: Task[] = [
            {
                id: uuidv4(),
                intakeId,
                title: 'Initial Follow-up',
                dueDate: addDays(createdDate, 2).toISOString(),
                completed: false,
                type: 'follow_up'
            },
            {
                id: uuidv4(),
                intakeId,
                title: 'Pre-Event Confirmation',
                dueDate: subDays(eventDate, 5).toISOString(),
                completed: false,
                type: 'pre_event'
            },
            {
                id: uuidv4(),
                intakeId,
                title: 'Final Reminder',
                dueDate: subDays(eventDate, 3).toISOString(),
                completed: false,
                type: 'reminder'
            },
            {
                id: uuidv4(),
                intakeId,
                title: 'Post-Event Follow-up',
                dueDate: addDays(eventDate, 1).toISOString(),
                completed: false,
                type: 'post_event'
            }
        ];

        set(state => ({
            tasks: [...state.tasks, ...newTasks]
        }));
      }
    }),
    {
      name: 'tsp-storage',
    }
  )
);
