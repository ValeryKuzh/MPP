import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    Res,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Controller()
export class TasksController {
    constructor(private readonly tasksService: TasksService) {}

    private getMulterOptions() {
        return {
            storage: diskStorage({
                destination: (req, file, cb) => {
                    const uploadDir = path.join(process.cwd(), 'uploads');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    cb(null, uploadDir);
                },
                filename: (req, file, cb) => {
                    const uniqueName = `${uuidv4()}-${file.originalname}`;
                    cb(null, uniqueName);
                },
            }),
            limits: { fileSize: 5 * 1024 * 1024 },
        };
    }

    @Get()
    async getTasks(@Query('filter') filter: string, @Res() res: Response) {
        const tasks = this.tasksService.findAll(filter);
        const stats = this.tasksService.getStats();

        res.render('index', {
            tasks,
            filter: filter || 'all',
            stats,
        });
    }

    @Post('tasks')
    @UseInterceptors(FileInterceptor('file'))
    async createTask(
        @Body() createTaskDto: CreateTaskDto,
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response,
    ) {
        this.tasksService.create(createTaskDto, file);
        res.redirect('/');
    }

    @Post('tasks/:id')
    async updateTask(
        @Param('id') id: string,
        @Body() updateTaskDto: UpdateTaskDto,
        @Res() res: Response,
    ) {
        this.tasksService.update(id, updateTaskDto);
        res.redirect('/');
    }

    @Post('tasks/:id/delete')
    async deleteTask(@Param('id') id: string, @Res() res: Response) {
        this.tasksService.delete(id);
        res.redirect('/');
    }

    @Post('tasks/:id/files')
    @UseInterceptors(FileInterceptor('file'))
    async addFile(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response,
    ) {
        this.tasksService.addFile(id, file);
        res.redirect('/');
    }

    @Post('tasks/:taskId/files/:fileIndex/delete')
    async removeFile(
        @Param('taskId') taskId: string,
        @Param('fileIndex') fileIndex: string,
        @Res() res: Response,
    ) {
        this.tasksService.removeFile(taskId, parseInt(fileIndex, 10));
        res.redirect('/');
    }
}