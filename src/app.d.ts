import type { User } from '$types/api';

declare global {
namespace App {
interface Locals {
user?: User | null;
}
}
}

export {};
