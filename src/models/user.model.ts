import { Document, model, Schema } from "mongoose"
import bcrypt from "bcryptjs"

export enum UserRole {
  CUSTOMER = "CUSTOMER",
  ADMIN = "ADMIN",
  INVENTORY_MANAGER = "INVENTORY_MANAGER",
}

export interface IUser extends Document {
  fullName: string
  email: string
  password?: string
  phone?: string
  role: UserRole
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  comparePassword(candidatePassword: string): Promise<boolean>
}

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Full name must be at least 2 characters long"],
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
      select: false, // Do not return password by default in queries
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.CUSTOMER,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        delete ret.password
        delete ret.__v
        ret.id = ret._id
        delete ret._id
        return ret
      },
    },
  }
)

// Pre-save hook: Hash password with bcryptjs before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) {
    return
  }

  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

// Compare candidate password with stored hashed password
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false
  return bcrypt.compare(candidatePassword, this.password)
}

export const UserModel = model<IUser>("User", userSchema)
