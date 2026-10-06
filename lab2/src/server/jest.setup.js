process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

const express = require('express');
jest.spyOn(express.application, 'listen').mockImplementation(function () {
    return this;
});