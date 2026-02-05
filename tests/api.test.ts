import { describe, it, expect, vi } from 'vitest';
import { GET as getAvatar } from '../src/routes/api/avatar/[id]/+server';
import { getPersonById } from '$lib/server/database';

// Mock database module
vi.mock('$lib/server/database', () => ({
  getPersonById: vi.fn(),
  getDatabase: vi.fn(),
}));

// Mock process.env
process.env.MIGALLERY_API_KEY = 'mock-key';

describe('Avatar API Endpoints', () => {
    it('returns redirect to database image if present', async () => {
        // Arrange
        const mockPerson = {
            id: 'test.user',
            image: 'https://example.com/avatar.jpg'
        };
        (getPersonById as any).mockReturnValue(mockPerson);

        const requestEvent: any = {
            params: { id: 'test.user' }
        };

        // Act
        const response: Response = await getAvatar(requestEvent as any);

        // Assert
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://example.com/avatar.jpg');
    });

    it('falls back to fetch if no database image', async () => {
        // Arrange
        (getPersonById as any).mockReturnValue(null);
        
        // Mock global fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
            headers: { get: () => 'image/jpeg' }
        });

        const requestEvent: any = {
            params: { id: 'remote.user' }
        };

        // Act
        const response: Response = await getAvatar(requestEvent as any);

        // Assert
        expect(response.status).toBe(200);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('gallery.mitv.fr'),
            expect.any(Object)
        );
    });
});
