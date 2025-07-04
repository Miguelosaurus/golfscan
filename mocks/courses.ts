import { Course } from '@/types';
import { generateUniqueId } from '@/utils/helpers';

export const mockCourses: Course[] = [
  {
    id: generateUniqueId(),
    name: "Pine Valley Golf Club",
    location: "Pine Valley, NJ",
    imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
    holes: Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
      distance: 150 + (i * 20),
      handicap: i + 1
    }))
  },
  {
    id: generateUniqueId(),
    name: "Augusta National Golf Club",
    location: "Augusta, GA",
    imageUrl: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
    holes: Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: i % 3 === 0 ? 4 : i % 3 === 1 ? 5 : 3,
      distance: 180 + (i * 15),
      handicap: i + 1
    }))
  },
  {
    id: generateUniqueId(),
    name: "Pebble Beach Golf Links",
    location: "Pebble Beach, CA",
    imageUrl: "https://images.unsplash.com/photo-1600170033898-2b4e864a6a4e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
    holes: Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: i % 4 === 0 ? 3 : i % 4 === 1 ? 4 : i % 4 === 2 ? 5 : 4,
      distance: 160 + (i * 18),
      handicap: i + 1
    }))
  }
];