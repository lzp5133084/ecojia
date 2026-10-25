# -*- coding: utf-8 -*-
"""V1.7 浏览器端验证：登录 → 主页 → AI助手 → 年报 → 验证器，桌面/手机双视口截图"""
import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8401"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots_v17")
os.makedirs(OUT, exist_ok=True)

def main():
    with sync_playwright() as p:
        br = p.chromium.launch()
        # ── 桌面端 ──
        pg = br.new_page(viewport={"width": 1440, "height": 900})
        pg.goto(BASE + "/login")
        pg.fill('#l-username', "hxa17")
        pg.fill('#l-password', "test123456")
        pg.click('#form-login button[type="submit"]')
        pg.wait_for_timeout(1200)
        pg.goto(BASE + "/huoxing")
        pg.wait_for_selector("#hxApp:not([hidden])", timeout=15000)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=OUT + "/01_home_desktop.png", full_page=True)
        print("PASS 桌面主页", pg.title())

        # AI 助手弹窗
        pg.click("#hxAiOpen")
        pg.wait_for_timeout(600)
        pg.screenshot(path=OUT + "/02_ai_modal.png")
        print("PASS AI助手弹窗")

        # 年报页
        pg.goto(BASE + "/huoxing/annual/2026")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=OUT + "/03_annual.png", full_page=True)
        print("PASS 年报页", "2026" in pg.content())

        # 验证器页
        pg.goto(BASE + "/hx/verify")
        pg.wait_for_timeout(800)
        pg.screenshot(path=OUT + "/04_verify.png", full_page=True)
        print("PASS 验证器页")
        pg.close()

        # ── 手机端 ──
        mp = br.new_page(viewport={"width": 390, "height": 844},
                         user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")
        mp.goto(BASE + "/login")
        mp.fill('#l-username', "hxa17")
        mp.fill('#l-password', "test123456")
        mp.click('#form-login button[type="submit"]')
        mp.wait_for_timeout(1200)
        mp.goto(BASE + "/huoxing")
        mp.wait_for_selector("#hxApp:not([hidden])", timeout=15000)
        mp.wait_for_timeout(1500)
        mp.screenshot(path=OUT + "/05_home_mobile.png", full_page=True)
        print("PASS 手机主页")
        mp.close()
        br.close()

if __name__ == "__main__":
    main()
