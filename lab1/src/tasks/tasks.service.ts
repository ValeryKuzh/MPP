import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { ITask } from './interfaces/task.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  private tasks: ITask[] = [];

  constructor() {
    // Добавляем тестовые задачи
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // this.tasks = [
    //   {
    //     id: uuidv4(),
    //     title: 'Подготовить отчет',
    //     description: 'Завершить отчет по проекту',
    //     status: 'pending',
    //     dueDate: tomorrow.toISOString().split('T')[0],
    //     files: [],
    //     createdAt: new Date(),
    //   },
    //   {
    //     id: uuidv4(),
    //     title: 'Провести встречу',
    //     description: 'Обсудить планы на спринт',
    //     status: 'in-progress',
    //     dueDate: now.toISOString().split('T')[0],
    //     files: [],
    //     createdAt: new Date(),
    //   },
    // ];
  }

  findAll(filter?: string): ITask[] {
    if (!filter || filter === 'all') {
      return this.tasks;
    }
    return this.tasks.filter(task => task.status === filter);
  }

  create(createTaskDto: CreateTaskDto, file?: any): ITask {
    const newTask: ITask = {
      id: uuidv4(),
      title: createTaskDto.title || 'Без названия',
      description: createTaskDto.description || '',
      status: createTaskDto.status || 'pending',
      dueDate: createTaskDto.dueDate || '',
      files: [],
      createdAt: new Date(),
    };

    if (file) {
      newTask.files.push({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
      });
    }

    this.tasks.unshift(newTask);
    return newTask;
  }

  update(id: string, updateTaskDto: UpdateTaskDto): ITask | undefined {
    const taskIndex = this.tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) return undefined;

    this.tasks[taskIndex] = {
      ...this.tasks[taskIndex],
      ...updateTaskDto,
    };

    return this.tasks[taskIndex];
  }

  delete(id: string): boolean {
    const initialLength = this.tasks.length;
    this.tasks = this.tasks.filter(task => task.id !== id);
    return this.tasks.length < initialLength;
  }

  addFile(taskId: string, file: any): ITask | undefined {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return undefined;

    task.files.push({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      size: file.size,
    });

    return task;
  }

  removeFile(taskId: string, fileIndex: number): ITask | undefined {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task || !task.files[fileIndex]) return undefined;

    const filePath = task.files[fileIndex].path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    task.files.splice(fileIndex, 1);
    return task;
  }

  getStats() {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter(t => t.status === 'pending').length,
      inProgress: this.tasks.filter(t => t.status === 'in-progress').length,
      completed: this.tasks.filter(t => t.status === 'completed').length,
    };
  }
}