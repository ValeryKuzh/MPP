export class CreateTaskDto {
    title: string;
    description?: string;
    status?: 'pending' | 'in-progress' | 'completed';
    dueDate?: string;
}