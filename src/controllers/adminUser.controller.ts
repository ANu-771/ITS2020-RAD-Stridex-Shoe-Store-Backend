import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../types';
import { UserModel, UserRole } from '../models/user.model';
import { OrderModel } from '../models/order.model';

export const adminUserController = {
  /**
   * GET /api/v1/admin/users
   * Retrieves paginated registered users with filtering (search, role, status)
   * and live summary statistics.
   */
  getUsers: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);
      const search = (req.query.search as string || '').trim();
      const roleFilter = (req.query.role as string || '').trim().toUpperCase();
      const statusFilter = (req.query.status as string || '').trim().toLowerCase();

      // Build MongoDB query
      const query: any = {};

      // Search across name, email, and phone
      if (search) {
        query.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      // Filter by Role
      if (roleFilter && Object.values(UserRole).includes(roleFilter as UserRole)) {
        query.role = roleFilter;
      }

      // Filter by Status
      if (statusFilter === 'active' || statusFilter === 'true') {
        query.isActive = true;
      } else if (statusFilter === 'inactive' || statusFilter === 'false') {
        query.isActive = false;
      }

      // Execute counts and query in parallel
      const [
        totalFiltered,
        users,
        totalUsers,
        totalCustomers,
        totalInventoryManagers,
        totalAdmins,
        activeUsers,
        inactiveUsers,
      ] = await Promise.all([
        UserModel.countDocuments(query),
        UserModel.find(query)
          .select('-password')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        UserModel.countDocuments(),
        UserModel.countDocuments({ role: UserRole.CUSTOMER }),
        UserModel.countDocuments({ role: UserRole.INVENTORY_MANAGER }),
        UserModel.countDocuments({ role: UserRole.ADMIN }),
        UserModel.countDocuments({ isActive: true }),
        UserModel.countDocuments({ isActive: false }),
      ]);

      const formattedUsers = users.map((u) => ({
        id: u._id.toString(),
        fullName: u.fullName,
        email: u.email,
        phone: u.phone || '',
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));

      return res.status(200).json({
        success: true,
        data: formattedUsers,
        pagination: {
          page,
          limit,
          totalItems: totalFiltered,
          totalPages: Math.ceil(totalFiltered / limit) || 1,
        },
        stats: {
          totalUsers,
          totalCustomers,
          totalInventoryManagers,
          totalAdmins,
          activeUsers,
          inactiveUsers,
        },
      });
    } catch (err: any) {
      console.error('Error fetching admin users:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve user directory',
      });
    }
  },

  /**
   * GET /api/v1/admin/users/:id
   * Retrieves single user details and shopping statistics without exposing sensitive fields.
   */
  getUserById: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format',
        });
      }

      const user = await UserModel.findById(id).select('-password').lean();
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found',
        });
      }

      // Count user's orders and historical spend if customer
      const [orderCount, userOrders] = await Promise.all([
        OrderModel.countDocuments({ userId: user._id }),
        OrderModel.find({ userId: user._id, paymentStatus: 'PAID' }).select('finalTotal').lean(),
      ]);

      const totalSpent = userOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);

      return res.status(200).json({
        success: true,
        data: {
          id: user._id.toString(),
          fullName: user.fullName,
          email: user.email,
          phone: user.phone || '',
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          orderStats: {
            totalOrders: orderCount,
            totalSpent,
          },
        },
      });
    } catch (err: any) {
      console.error('Error fetching user by ID:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to retrieve user details',
      });
    }
  },

  /**
   * PATCH /api/v1/admin/users/:id/role
   * Updates a user's role (CUSTOMER, INVENTORY_MANAGER, ADMIN).
   * Enforces protection against demoting the last active administrator.
   */
  updateUserRole: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format',
        });
      }

      const { role } = req.body;
      if (!role || !Object.values(UserRole).includes(role as UserRole)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role specified. Must be one of [${Object.values(UserRole).join(', ')}]`,
        });
      }

      const targetUser = await UserModel.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User account not found',
        });
      }

      // No change required
      if (targetUser.role === role) {
        return res.status(200).json({
          success: true,
          message: `User is already assigned the ${role} role`,
          data: {
            id: targetUser._id.toString(),
            fullName: targetUser.fullName,
            email: targetUser.email,
            phone: targetUser.phone || '',
            role: targetUser.role,
            isActive: targetUser.isActive,
          },
        });
      }

      // SECURITY RULE: Protect the last active administrator from demotion
      if (targetUser.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
        const activeAdminsCount = await UserModel.countDocuments({
          role: UserRole.ADMIN,
          isActive: true,
        });

        if (activeAdminsCount <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot demote the last active administrator.',
          });
        }

        // Check self-demotion
        if (req.user?.sub === targetUser._id.toString()) {
          const otherActiveAdmins = await UserModel.countDocuments({
            _id: { $ne: targetUser._id },
            role: UserRole.ADMIN,
            isActive: true,
          });

          if (otherActiveAdmins < 1) {
            return res.status(400).json({
              success: false,
              message: 'You cannot remove your own administrator access without another active administrator.',
            });
          }
        }
      }

      const previousRole = targetUser.role;
      targetUser.role = role as UserRole;
      await targetUser.save();

      console.log(
        `[Admin User Management] Admin ${req.user?.email || 'admin'} changed role of ${targetUser.email} from ${previousRole} to ${role}`
      );

      return res.status(200).json({
        success: true,
        message: `User role successfully updated from ${previousRole} to ${role}`,
        data: {
          id: targetUser._id.toString(),
          fullName: targetUser.fullName,
          email: targetUser.email,
          phone: targetUser.phone || '',
          role: targetUser.role,
          isActive: targetUser.isActive,
        },
      });
    } catch (err: any) {
      console.error('Error updating user role:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to update user role',
      });
    }
  },

  /**
   * PATCH /api/v1/admin/users/:id/status
   * Activates or deactivates a user account.
   * Enforces protection against deactivating the last active administrator.
   */
  updateUserStatus: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format',
        });
      }

      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Field "isActive" must be a boolean (true or false)',
        });
      }

      const targetUser = await UserModel.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User account not found',
        });
      }

      // SECURITY RULE: Protect the last active administrator from deactivation
      if (targetUser.role === UserRole.ADMIN && isActive === false) {
        const activeAdminsCount = await UserModel.countDocuments({
          role: UserRole.ADMIN,
          isActive: true,
        });

        if (activeAdminsCount <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot deactivate the last active administrator.',
          });
        }

        // Check self-deactivation
        if (req.user?.sub === targetUser._id.toString()) {
          const otherActiveAdmins = await UserModel.countDocuments({
            _id: { $ne: targetUser._id },
            role: UserRole.ADMIN,
            isActive: true,
          });

          if (otherActiveAdmins < 1) {
            return res.status(400).json({
              success: false,
              message: 'You cannot deactivate your own administrator account without another active administrator.',
            });
          }
        }
      }

      targetUser.isActive = isActive;
      await targetUser.save();

      console.log(
        `[Admin User Management] Admin ${req.user?.email || 'admin'} ${isActive ? 'activated' : 'deactivated'} account: ${targetUser.email}`
      );

      return res.status(200).json({
        success: true,
        message: `User account successfully ${isActive ? 'activated' : 'deactivated'}`,
        data: {
          id: targetUser._id.toString(),
          fullName: targetUser.fullName,
          email: targetUser.email,
          phone: targetUser.phone || '',
          role: targetUser.role,
          isActive: targetUser.isActive,
        },
      });
    } catch (err: any) {
      console.error('Error updating user status:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to update user status',
      });
    }
  },
};
