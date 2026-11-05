import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      required: true,
    },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, returned) {
        delete returned.passwordHash;
        delete returned.__v;
        return returned;
      },
    },
    toObject: {
      transform(_document, returned) {
        delete returned.passwordHash;
        delete returned.__v;
        return returned;
      },
    },
  },
);

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
