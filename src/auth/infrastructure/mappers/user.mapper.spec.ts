import { User } from '../../domain/entities/user.model';
import { Gender } from '../../domain/enums/user.enum';

import { UserMapper } from './user.mapper';

describe('UserMapper', () => {
  it('preserves user state and timestamps when mapping to persistence', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const user = new User(
      'user-id',
      'Test User',
      'test@example.com',
      '+1234567890',
      Gender.FEMALE,
      false,
      true,
      createdAt,
      updatedAt,
      'hashed-password',
    );

    const ormEntity = UserMapper.toOrmEntity(user);

    expect(ormEntity).toMatchObject({
      id: 'user-id',
      name: 'Test User',
      email: 'test@example.com',
      phone: '+1234567890',
      gender: Gender.FEMALE,
      password: 'hashed-password',
      isActive: false,
      isVerified: true,
      createdAt,
      updatedAt,
    });
  });
});
