export class UpdateTaskDto {
    title?: string;
    description?: string;
    status?: 'pending' | 'in-progress' | 'completed';
    dueDate?: string;
}