
"use client";

import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API_URL } from '@/lib/constants';
import { toast } from 'react-hot-toast';

export default function AddTrainPage() {
    const { user } = useAuth();

    const [formData, setFormData] = useState({
        trainNumber: '',
        name: '',
        type: 'Express',
        source: '',
        destination: '',
        departureTime: '',
        arrivalTime: '',
        distance: '',
        baseFare: '',
        status: 'Active',
        daysOfOperation: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        classes: ['SL', '3A', '2A'],
        coaches: []
    });

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        try {
            const config = {
                headers: {
                    Authorization: `Bearer ${user?.token}`
                }
            };

            const payload = {
                ...formData,
                distance: Number(formData.distance),
                baseFare: Number(formData.baseFare)
            };

            await axios.post(`${API_URL}/trains`, payload, config);
            toast.success('Train Added Successfully');
        } catch (error: unknown) {
            if (axios.isAxiosError<{ message?: string }>(error)) {
                toast.error(error.response?.data?.message || 'Failed to add train');
            } else {
                toast.error('Failed to add train');
            }
        }
    };

    if (user?.role !== 'admin') {
        return <div className="p-10 text-center text-red-500">Access Denied. Admins Only.</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-md">
                <h1 className="text-2xl font-bold mb-6">Add New Train (Admin)</h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <h2 className="text-lg font-semibold mb-2 text-blue-700">Train Details</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Train Number</label>
                                <input name="trainNumber" placeholder="e.g. 12951" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Train Name</label>
                                <input name="name" placeholder="e.g. Rajdhani Express" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Status</label>
                                <select name="status" onChange={handleChange} value={formData.status} className="border p-2 rounded w-full" required>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="Cancelled">Cancelled</option>
                                    <option value="Delayed">Delayed</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Type</label>
                                <select name="type" onChange={handleChange} value={formData.type} className="border p-2 rounded w-full" required>
                                    <option value="Express">Express</option>
                                    <option value="Superfast">Superfast</option>
                                    <option value="Shatabdi">Shatabdi</option>
                                    <option value="Rajdhani">Rajdhani</option>
                                    <option value="Duronto">Duronto</option>
                                    <option value="Local">Local</option>
                                    <option value="Mail/Express">Mail/Express</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold mb-2 text-blue-700">Route Information</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Source Station Code</label>
                                <input name="source" placeholder="e.g. NDLS" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Destination Station Code</label>
                                <input name="destination" placeholder="e.g. BCT" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold mb-2 text-blue-700">Timings</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Departure Time (HH:MM)</label>
                                <input name="departureTime" placeholder="e.g. 16:30" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Arrival Time (HH:MM)</label>
                                <input name="arrivalTime" placeholder="e.g. 08:45" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold mb-2 text-blue-700">Fare & Distance</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Distance (km)</label>
                                <input name="distance" type="number" placeholder="e.g. 1384" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Base Fare (₹)</label>
                                <input name="baseFare" type="number" placeholder="e.g. 2500" onChange={handleChange} className="border p-2 rounded w-full" required />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">
                        Add Train
                    </button>
                </form>
            </div>
        </div>
    );
}
