"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';

let globalSocket: Socket | null = null;
let connectionCount = 0;

export function useSocket() {
    const { user } = useAuth();
    const socketRef = useRef<Socket | null>(null);
    const trackedTrainsRef = useRef<Set<string>>(new Set());
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        if (!user) return;

        if (!globalSocket) {
            globalSocket = io(SOCKET_URL, {
                withCredentials: true,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 10000,
            });
        }
        socketRef.current = globalSocket;
        setSocket(globalSocket);
        connectionCount++;

        const handleConnect = () => {
            if (globalSocket && user) {
                globalSocket.emit('join:user', user._id);
                for (const trainId of trackedTrainsRef.current) {
                    globalSocket.emit('join:train', trainId);
                }
            }
        };

        globalSocket.on('connect', handleConnect);

        const handleBookingNotification = () => {};
        globalSocket.on('notification:booking', handleBookingNotification);

        return () => {
            connectionCount--;
            if (connectionCount <= 0 && globalSocket) {
                globalSocket.off('connect', handleConnect);
                globalSocket.off('notification:booking', handleBookingNotification);
                globalSocket.disconnect();
                globalSocket = null;
            }
            socketRef.current = null;
            setSocket(null);
        };
    }, [user]);

    const trackTrain = useCallback((trainId: string) => {
        if (!socketRef.current) return;
        trackedTrainsRef.current.add(trainId);
        socketRef.current.emit('join:train', trainId);
    }, []);

    const stopTracking = useCallback((trainId: string) => {
        if (!socketRef.current) return;
        trackedTrainsRef.current.delete(trainId);
        socketRef.current.emit('leave:train', trainId);
    }, []);

    const joinTelemetryAll = useCallback(() => {
        socketRef.current?.emit('join:telemetry:all');
    }, []);

    const leaveTelemetryAll = useCallback(() => {
        socketRef.current?.emit('leave:telemetry:all');
    }, []);

    const joinETAGlobal = useCallback(() => {
        socketRef.current?.emit('join:eta:global');
    }, []);

    return {
        socket,
        trackTrain,
        stopTracking,
        joinTelemetryAll,
        leaveTelemetryAll,
        joinETAGlobal,
    };
}
