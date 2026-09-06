export interface IFile {
    filename: string;
    originalName: string;
    path: string;
    size: number;
}

export interface ITask {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed';
    dueDate: string;
    files: IFile[];
    createdAt: Date;
}