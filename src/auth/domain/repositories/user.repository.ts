import { User } from 'src/auth/domain/entities/user.model';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByEmailOrPhone(email: string, phone: string): Promise<User[]>;
  findAll(skip: number, take: number): Promise<[User[], number]>;
  save(user: User): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
