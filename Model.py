from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # 第一次运行会自动下载模型

results = model("house.jpeg")  # 用网上的测试图

results[0].show()  # 弹出窗口显示检测结果